/**
 * Zero-dependency Prometheus text-format metrics registry.
 *
 * Services expose counters, gauges and histograms (API latency, event
 * throughput) via `format()` on a lightweight `/metrics` endpoint.
 * Label values here are bounded-cardinality dimensions only (method, route
 * template). Sensitive values (user ids, emails) must never be used as
 * labels; they are logged through the structured logger instead.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram';

export type Labels = Record<string, string | number>;

interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
}

interface Series {
  name: string;
  labels: Labels;
  value?: number;
  buckets?: number[];
  bucketBounds?: number[];
  sum?: number;
  count?: number;
}

const MAX_SERIES = 1000;

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function isLabelSafe(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

export class MetricsRegistry {
  private definitions = new Map<string, MetricDefinition>();
  private series = new Map<string, Series>();

  private assertCardinality(): void {
    if (this.series.size >= MAX_SERIES) {
      // Bounded memory: evict oldest entries if a runaway label combination
      // appears. Metrics are best-effort and must never OOM the service.
      const evictCount = Math.ceil(MAX_SERIES / 4);
      const keys = Array.from(this.series.keys()).slice(0, evictCount);
      for (const key of keys) this.series.delete(key);
    }
  }

  private seriesKey(name: string, labels: Labels): string {
    const pairs = Object.keys(labels)
      .sort()
      .map((label) => `${label}=${JSON.stringify(String(labels[label] ?? ''))}`);
    return `${name}|${pairs.join(',')}`;
  }

  private labelString(labels: Labels): string {
    const invalid = Object.keys(labels).filter((key) => !isLabelSafe(key));
    if (invalid.length > 0) {
      throw new Error(`Invalid label names: ${invalid.join(', ')}`);
    }
    const pairs = Object.entries(labels).map(
      ([key, value]) => `${key}="${escapeLabelValue(String(value ?? ''))}"`,
    );
    return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
  }

  counter(name: string, help: string, labels: Labels = {}, amount = 1): void {
    if (amount < 0) throw new Error('Counter increments must be non-negative');
    this.registerDefinition(name, help, 'counter');
    this.record(name, labels, { value: (this.currentValue(name, labels)) + amount });
  }

  private currentValue(name: string, labels: Labels): number {
    return this.series.get(this.seriesKey(name, labels))?.value ?? 0;
  }

  private record(name: string, labels: Labels, patch: Partial<Series>): void {
    const invalid = Object.keys(labels).filter((key) => !isLabelSafe(key));
    if (invalid.length > 0) {
      throw new Error(`Invalid label names: ${invalid.join(', ')}`);
    }
    this.assertCardinality();
    const existing = this.series.get(this.seriesKey(name, labels));
    this.series.set(this.seriesKey(name, labels), {
      ...existing,
      name,
      labels,
      ...patch,
    });
  }

  gauge(name: string, help: string, labels: Labels = {}, value = 0): void {
    this.registerDefinition(name, help, 'gauge');
    this.record(name, labels, { value });
  }

  histogram(
    name: string,
    help: string,
    labels: Labels,
    observation: number,
    bounds: number[] = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  ): void {
    this.registerDefinition(name, help, 'histogram');
    const existing = this.series.get(this.seriesKey(name, labels));
    const currentBuckets = existing?.buckets ?? bounds.map(() => 0);
    const nextBuckets = bounds.map((bound, index) =>
      observation <= bound ? currentBuckets[index] + 1 : currentBuckets[index],
    );
    this.record(name, labels, {
      buckets: nextBuckets,
      bucketBounds: bounds,
      sum: (existing?.sum ?? 0) + observation,
      count: (existing?.count ?? 0) + 1,
    });
  }

  /** Renders the registry in Prometheus text format (version 0.0.4). */
  format(): string {
    const lines: string[] = [];
    for (const definition of this.definitions.values()) {
      lines.push(`# HELP ${definition.name} ${definition.help}`);
      lines.push(`# TYPE ${definition.name} ${definition.type}`);
    }
    for (const series of this.series.values()) {
      const labelStr = this.labelString(series.labels);
      if (series.buckets && series.bucketBounds) {
        series.bucketBounds.forEach((bound, index) => {
          const boundLabel = 'le="' + String(bound) + '"';
          const boundLabels =
            labelStr === '' ? '{' + boundLabel + '}' : labelStr.slice(0, -1) + ',' + boundLabel + '}';
          lines.push(`${series.name}_bucket${boundLabels} ${series.buckets![index]}`);
        });
        lines.push(`${series.name}_sum${labelStr} ${series.sum ?? 0}`);
        lines.push(`${series.name}_count${labelStr} ${series.count ?? 0}`);
      } else {
        lines.push(`${series.name}${labelStr} ${series.value ?? 0}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  private registerDefinition(name: string, help: string, type: MetricType): void {
    if (!this.definitions.has(name)) {
      this.definitions.set(name, { name, help, type });
    }
  }

  reset(): void {
    this.series.clear();
    this.definitions.clear();
  }

  /** Snapshot for tests and internal dashboards; not for transport. */
  snapshot(): { definitions: MetricDefinition[]; series: Series[] } {
    return {
      definitions: Array.from(this.definitions.values()),
      series: Array.from(this.series.values()),
    };
  }
}

export function createMetrics(serviceName: string): {
  registry: MetricsRegistry;
  observeHttpRequest: (method: string, route: string, statusCode: number, durationMs: number) => void;
  format: () => string;
} {
  const registry = new MetricsRegistry();
  const base = { service: serviceName };

  return {
    registry,
    observeHttpRequest: (method, route, statusCode, durationMs) => {
      registry.counter(
        'edunet_http_requests_total',
        'Total HTTP requests handled by the service',
        { ...base, method, route, status: String(statusCode) },
      );
      registry.histogram(
        'edunet_http_request_duration_ms',
        'HTTP request latency in milliseconds',
        { ...base, method, route },
        durationMs,
      );
    },
    format: () => registry.format(),
  };
}
