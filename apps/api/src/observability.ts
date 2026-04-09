import { metrics, SpanKind, SpanStatusCode, trace, type Counter, type Histogram } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { createNoopLogger, type Logger } from "@tally/logging";
import type { ApiRuntimeConfig } from "./config";
import type { ApiMetrics, ApiRequestMetric } from "./metrics";

export interface HttpRequestObservation {
  spanId?: string;
  traceId?: string;
  complete(input: { error?: Error; status: number }): void;
}

export interface HttpRequestObserver {
  start(input: {
    method: string;
    path: string;
    persistenceBackend: string;
    requestId: string;
    route: string;
    runtimeMode: string;
  }): HttpRequestObservation;
}

export interface ApiObservability {
  metrics: ApiMetrics;
  requestObserver?: HttpRequestObserver;
  shutdown(): Promise<void>;
}

class CompositeApiMetrics implements ApiMetrics {
  constructor(
    private readonly localMetrics: ApiMetrics,
    private readonly otelMetrics?: {
      durationMs: Histogram;
      failures: Counter;
      requests: Counter;
    },
  ) {}

  recordRequest(metric: ApiRequestMetric): void {
    this.localMetrics.recordRequest(metric);

    if (!this.otelMetrics) {
      return;
    }

    const attributes = {
      http_method: metric.method,
      http_route: metric.route,
      http_status_code: String(metric.status),
    };

    this.otelMetrics.requests.add(1, attributes);
    if (metric.status >= 400) {
      this.otelMetrics.failures.add(1, attributes);
    }
    this.otelMetrics.durationMs.record(metric.durationMs, {
      http_method: metric.method,
      http_route: metric.route,
    });
  }

  renderPrometheus(): string {
    return this.localMetrics.renderPrometheus();
  }
}

export function createApiObservability(params: {
  config: ApiRuntimeConfig;
  localMetrics: ApiMetrics;
  logger?: Logger;
}): ApiObservability {
  const logger = (params.logger ?? createNoopLogger()).child({ component: "apiObservability" });
  const settings = params.config.observability;

  if (!settings.enabled) {
    return {
      metrics: new CompositeApiMetrics(params.localMetrics),
      async shutdown(): Promise<void> {},
    };
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: settings.serviceName,
  });

  const traceExporter = new OTLPTraceExporter({
    headers: settings.otlpHeaders,
    timeoutMillis: settings.exportTimeoutMs,
    url: settings.otlpEndpoint,
  });
  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });
  tracerProvider.register();
  const tracer = tracerProvider.getTracer(settings.serviceName);

  const metricExporter = new OTLPMetricExporter({
    headers: settings.otlpHeaders,
    timeoutMillis: settings.exportTimeoutMs,
    url: settings.otlpEndpoint,
  });
  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exportIntervalMillis: settings.metricsExportIntervalMs,
        exporter: metricExporter,
      }),
    ],
    resource,
  });
  metrics.setGlobalMeterProvider(meterProvider);
  const meter = meterProvider.getMeter(settings.serviceName);
  const otelMetrics = {
    durationMs: meter.createHistogram("tally.api.http.request.duration.ms", {
      description: "HTTP request duration in milliseconds.",
      unit: "ms",
    }),
    failures: meter.createCounter("tally.api.http.request.failures", {
      description: "HTTP requests with 4xx/5xx responses.",
    }),
    requests: meter.createCounter("tally.api.http.requests", {
      description: "Total completed HTTP requests.",
    }),
  };

  logger.info("api observability configured", {
    enabled: true,
    exportTimeoutMs: settings.exportTimeoutMs,
    metricsExportIntervalMs: settings.metricsExportIntervalMs,
    otlpEndpointHost: settings.otlpEndpointHost,
    serviceName: settings.serviceName,
  });

  const requestObserver: HttpRequestObserver = {
    start(input): HttpRequestObservation {
      const span = tracer.startSpan(`HTTP ${input.method} ${input.route}`, {
        attributes: {
          "http.method": input.method,
          "http.route": input.route,
          "url.path": input.path,
          "tally.persistence.backend": input.persistenceBackend,
          "tally.request.id": input.requestId,
          "tally.runtime.mode": input.runtimeMode,
        },
        kind: SpanKind.SERVER,
      });
      const spanContext = span.spanContext();
      let completed = false;

      return {
        spanId: spanContext.spanId,
        traceId: spanContext.traceId,
        complete({ error, status }): void {
          if (completed) {
            return;
          }
          completed = true;

          span.setAttribute("http.status_code", status);
          if (error) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          } else if (status >= 400) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          } else {
            span.setStatus({ code: SpanStatusCode.OK });
          }
          span.end();
        },
      };
    },
  };

  return {
    metrics: new CompositeApiMetrics(params.localMetrics, otelMetrics),
    requestObserver,
    async shutdown(): Promise<void> {
      await meterProvider.shutdown();
      await tracerProvider.shutdown();
    },
  };
}
