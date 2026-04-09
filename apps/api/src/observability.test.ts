import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiRuntimeConfig } from "./config";
import { createApiObservability } from "./observability";

const mocks = vi.hoisted(() => ({
  mockCounterAdd: vi.fn(),
  mockHistogramRecord: vi.fn(),
  mockSetGlobalMeterProvider: vi.fn(),
  mockMeterShutdown: vi.fn(async () => {}),
  mockTracerShutdown: vi.fn(async () => {}),
  mockSpanSetAttribute: vi.fn(),
  mockSpanRecordException: vi.fn(),
  mockSpanSetStatus: vi.fn(),
  mockSpanEnd: vi.fn(),
}));
const mockStartSpan = vi.fn(() => ({
  end: mocks.mockSpanEnd,
  recordException: mocks.mockSpanRecordException,
  setAttribute: mocks.mockSpanSetAttribute,
  setStatus: mocks.mockSpanSetStatus,
  spanContext: () => ({ spanId: "span-1", traceId: "trace-1" }),
}));

vi.mock("@opentelemetry/api", () => ({
  SpanKind: { SERVER: "server" },
  SpanStatusCode: { ERROR: "error", OK: "ok" },
  metrics: { setGlobalMeterProvider: mocks.mockSetGlobalMeterProvider },
  trace: {},
}));

vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({
  OTLPMetricExporter: class {
    constructor(_options: unknown) {}
  },
}));

vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
  OTLPTraceExporter: class {
    constructor(_options: unknown) {}
  },
}));

vi.mock("@opentelemetry/resources", () => ({
  resourceFromAttributes: (attributes: Record<string, string>) => ({ attributes }),
}));

vi.mock("@opentelemetry/sdk-metrics", () => ({
  MeterProvider: class {
    constructor(_options: unknown) {}

    getMeter(_name: string) {
      return {
        createCounter(_counterName: string, _options: unknown) {
          return { add: mocks.mockCounterAdd };
        },
        createHistogram(_histogramName: string, _options: unknown) {
          return { record: mocks.mockHistogramRecord };
        },
      };
    }

    shutdown() {
      return mocks.mockMeterShutdown();
    }
  },
  PeriodicExportingMetricReader: class {
    constructor(_options: unknown) {}
  },
}));

vi.mock("@opentelemetry/sdk-trace-node", () => ({
  BatchSpanProcessor: class {
    constructor(_exporter: unknown) {}
  },
  NodeTracerProvider: class {
    constructor(_options: unknown) {}

    getTracer(_serviceName: string) {
      return {
        startSpan: mockStartSpan,
      };
    }

    register() {}

    shutdown() {
      return mocks.mockTracerShutdown();
    }
  },
}));

vi.mock("@opentelemetry/semantic-conventions", () => ({
  ATTR_SERVICE_NAME: "service.name",
}));

function createConfig(overrides: Partial<ApiRuntimeConfig> = {}): ApiRuntimeConfig {
  return {
    authIdentities: [],
    authSource: "none",
    authStrategy: "none",
    bodyLimitBytes: 1048576,
    corsAllowedOrigins: [],
    dataDirectory: "/tmp/tally-runtime",
    host: "127.0.0.1",
    persistenceBackend: "json",
    port: 4000,
    postgresUrl: "",
    logFormat: "auto",
    rateLimit: {
      importLimit: 10,
      mutationLimit: 30,
      readLimit: 120,
      windowMs: 60000,
    },
    observability: {
      enabled: false,
      exportTimeoutMs: 10000,
      metricsExportIntervalMs: 60000,
      otlpEndpoint: "http://127.0.0.1:4318/v1/otel",
      otlpEndpointHost: "127.0.0.1:4318",
      otlpHeaders: { authorization: "Bearer token" },
      serviceName: "tally-api",
    },
    runtimeMode: "development",
    seedDemoWorkspace: true,
    shutdownTimeoutMs: 10000,
    sqlitePath: "/tmp/tally-runtime-core/workspaces.sqlite",
    ...overrides,
  };
}

describe("api observability", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns no-op observer when disabled", async () => {
    const localMetrics = {
      recordRequest: vi.fn(),
      renderPrometheus: vi.fn(() => "# local\n"),
    };
    const observability = createApiObservability({
      config: createConfig({ observability: { ...createConfig().observability, enabled: false } }),
      localMetrics,
    });

    observability.metrics.recordRequest({ durationMs: 10, method: "GET", route: "/health", status: 200 });
    expect(localMetrics.recordRequest).toHaveBeenCalledTimes(1);
    expect(observability.requestObserver).toBeUndefined();
    await expect(observability.shutdown()).resolves.toBeUndefined();
  });

  it("records otel metrics, traces requests, and shuts down providers when enabled", async () => {
    const localMetrics = {
      recordRequest: vi.fn(),
      renderPrometheus: vi.fn(() => "# local\n"),
    };
    const logger = {
      child: () => logger,
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const observability = createApiObservability({
      config: createConfig({ observability: { ...createConfig().observability, enabled: true } }),
      localMetrics,
      logger,
    });

    observability.metrics.recordRequest({ durationMs: 42, method: "POST", route: "/books/:id", status: 201 });
    observability.metrics.recordRequest({ durationMs: 14, method: "POST", route: "/books/:id", status: 500 });

    expect(localMetrics.recordRequest).toHaveBeenCalledTimes(2);
    expect(mocks.mockCounterAdd).toHaveBeenCalledTimes(3);
    expect(mocks.mockHistogramRecord).toHaveBeenCalledTimes(2);
    expect(mocks.mockSetGlobalMeterProvider).toHaveBeenCalledTimes(1);

    const observation = observability.requestObserver?.start({
      method: "POST",
      path: "/api/books/workspace",
      persistenceBackend: "sqlite",
      requestId: "req-1",
      route: "/books/:id",
      runtimeMode: "test",
    });

    expect(observation?.traceId).toBe("trace-1");
    expect(observation?.spanId).toBe("span-1");

    observation?.complete({ status: 200 });
    observation?.complete({ status: 200 });

    const failedObservation = observability.requestObserver?.start({
      method: "GET",
      path: "/api/books/workspace",
      persistenceBackend: "json",
      requestId: "req-2",
      route: "/books/:id",
      runtimeMode: "test",
    });
    failedObservation?.complete({ error: new Error("boom"), status: 500 });

    expect(mockStartSpan).toHaveBeenCalledTimes(2);
    expect(mocks.mockSpanSetAttribute).toHaveBeenCalled();
    expect(mocks.mockSpanSetStatus).toHaveBeenCalled();
    expect(mocks.mockSpanRecordException).toHaveBeenCalledTimes(1);
    expect(mocks.mockSpanEnd).toHaveBeenCalledTimes(2);

    await observability.shutdown();

    expect(mocks.mockMeterShutdown).toHaveBeenCalledTimes(1);
    expect(mocks.mockTracerShutdown).toHaveBeenCalledTimes(1);
  });
});
