export interface ApiRequestMetric {
  durationMs: number;
  method: string;
  route: string;
  status: number;
}

export interface ApiMetrics {
  recordRequest(metric: ApiRequestMetric): void;
  renderPrometheus(): string;
}

interface RequestAggregate {
  count: number;
  maxDurationMs: number;
  sumDurationMs: number;
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function labelsToString(labels: Record<string, string>): string {
  const entries = Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`);

  return `{${entries.join(",")}}`;
}

function recordKey(metric: Pick<ApiRequestMetric, "method" | "route" | "status">): string {
  return JSON.stringify({
    method: metric.method,
    route: metric.route,
    status: String(metric.status),
  });
}

function routeKey(metric: Pick<ApiRequestMetric, "method" | "route">): string {
  return JSON.stringify({
    method: metric.method,
    route: metric.route,
  });
}

export function createInMemoryApiMetrics(): ApiMetrics {
  const requestCounts = new Map<string, number>();
  const requestFailures = new Map<string, number>();
  const requestDurations = new Map<string, RequestAggregate>();

  return {
    recordRequest(metric) {
      const byStatusKey = recordKey(metric);
      requestCounts.set(byStatusKey, (requestCounts.get(byStatusKey) ?? 0) + 1);

      if (metric.status >= 400) {
        requestFailures.set(byStatusKey, (requestFailures.get(byStatusKey) ?? 0) + 1);
      }

      const byRouteKey = routeKey(metric);
      const aggregate = requestDurations.get(byRouteKey) ?? {
        count: 0,
        maxDurationMs: 0,
        sumDurationMs: 0,
      };

      aggregate.count += 1;
      aggregate.sumDurationMs += metric.durationMs;
      aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, metric.durationMs);

      requestDurations.set(byRouteKey, aggregate);
    },

    renderPrometheus() {
      const lines = [
        "# HELP gnucash_ng_http_requests_total Total completed HTTP requests.",
        "# TYPE gnucash_ng_http_requests_total counter",
      ];

      for (const [key, count] of [...requestCounts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const labels = JSON.parse(key) as { method: string; route: string; status: string };
        lines.push(`gnucash_ng_http_requests_total${labelsToString(labels)} ${count}`);
      }

      lines.push(
        "# HELP gnucash_ng_http_request_failures_total Total completed HTTP requests with 4xx or 5xx responses.",
        "# TYPE gnucash_ng_http_request_failures_total counter",
      );

      for (const [key, count] of [...requestFailures.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const labels = JSON.parse(key) as { method: string; route: string; status: string };
        lines.push(`gnucash_ng_http_request_failures_total${labelsToString(labels)} ${count}`);
      }

      lines.push(
        "# HELP gnucash_ng_http_request_duration_ms_count Total completed HTTP requests used in duration aggregation.",
        "# TYPE gnucash_ng_http_request_duration_ms_count counter",
      );

      for (const [key, aggregate] of [...requestDurations.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const labels = JSON.parse(key) as { method: string; route: string };
        lines.push(`gnucash_ng_http_request_duration_ms_count${labelsToString(labels)} ${aggregate.count}`);
      }

      lines.push(
        "# HELP gnucash_ng_http_request_duration_ms_sum Sum of HTTP request durations in milliseconds.",
        "# TYPE gnucash_ng_http_request_duration_ms_sum counter",
      );

      for (const [key, aggregate] of [...requestDurations.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const labels = JSON.parse(key) as { method: string; route: string };
        lines.push(`gnucash_ng_http_request_duration_ms_sum${labelsToString(labels)} ${aggregate.sumDurationMs}`);
      }

      lines.push(
        "# HELP gnucash_ng_http_request_duration_ms_max Maximum observed HTTP request duration in milliseconds.",
        "# TYPE gnucash_ng_http_request_duration_ms_max gauge",
      );

      for (const [key, aggregate] of [...requestDurations.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const labels = JSON.parse(key) as { method: string; route: string };
        lines.push(`gnucash_ng_http_request_duration_ms_max${labelsToString(labels)} ${aggregate.maxDurationMs}`);
      }

      return `${lines.join("\n")}\n`;
    },
  };
}
