export interface MetricPoint {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface Counter {
  inc(labels?: Record<string, string>, value?: number): void;
  get(labels?: Record<string, string>): number;
}

export interface Histogram {
  observe(value: number, labels?: Record<string, string>): void;
  getCount(labels?: Record<string, string>): number;
  getSum(labels?: Record<string, string>): number;
}

export interface MetricsRegistry {
  counter(name: string, description: string): Counter;
  histogram(name: string, description: string): Histogram;
  collect(): MetricPoint[];
  reset(): void;
}

function labelsKey(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
}

class CounterImpl implements Counter {
  readonly name: string;
  readonly description: string;
  private values: Map<string, { value: number; labels: Record<string, string> }>;

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
    this.values = new Map();
  }

  inc(labels?: Record<string, string>, value?: number): void {
    const key = labelsKey(labels);
    const existing = this.values.get(key);
    const increment = value ?? 1;
    if (existing) {
      existing.value += increment;
    } else {
      this.values.set(key, { value: increment, labels: { ...labels } });
    }
  }

  get(labels?: Record<string, string>): number {
    const key = labelsKey(labels);
    return this.values.get(key)?.value ?? 0;
  }

  collectPoints(): MetricPoint[] {
    const now = Date.now();
    const points: MetricPoint[] = [];
    for (const [, entry] of this.values) {
      points.push({
        name: this.name,
        value: entry.value,
        labels: { ...entry.labels },
        timestamp: now,
      });
    }
    return points;
  }

  reset(): void {
    this.values.clear();
  }
}

class HistogramImpl implements Histogram {
  readonly name: string;
  readonly description: string;
  private entries: Map<string, { count: number; sum: number; labels: Record<string, string> }>;

  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
    this.entries = new Map();
  }

  observe(value: number, labels?: Record<string, string>): void {
    const key = labelsKey(labels);
    const existing = this.entries.get(key);
    if (existing) {
      existing.count += 1;
      existing.sum += value;
    } else {
      this.entries.set(key, { count: 1, sum: value, labels: { ...labels } });
    }
  }

  getCount(labels?: Record<string, string>): number {
    const key = labelsKey(labels);
    return this.entries.get(key)?.count ?? 0;
  }

  getSum(labels?: Record<string, string>): number {
    const key = labelsKey(labels);
    return this.entries.get(key)?.sum ?? 0;
  }

  collectPoints(): MetricPoint[] {
    const now = Date.now();
    const points: MetricPoint[] = [];
    for (const [, entry] of this.entries) {
      points.push({
        name: `${this.name}_count`,
        value: entry.count,
        labels: { ...entry.labels },
        timestamp: now,
      });
      points.push({
        name: `${this.name}_sum`,
        value: entry.sum,
        labels: { ...entry.labels },
        timestamp: now,
      });
    }
    return points;
  }

  reset(): void {
    this.entries.clear();
  }
}

class MetricsRegistryImpl implements MetricsRegistry {
  private counters: CounterImpl[] = [];
  private histograms: HistogramImpl[] = [];

  counter(name: string, description: string): Counter {
    const c = new CounterImpl(name, description);
    this.counters.push(c);
    return c;
  }

  histogram(name: string, description: string): Histogram {
    const h = new HistogramImpl(name, description);
    this.histograms.push(h);
    return h;
  }

  collect(): MetricPoint[] {
    const points: MetricPoint[] = [];
    for (const c of this.counters) {
      points.push(...c.collectPoints());
    }
    for (const h of this.histograms) {
      points.push(...h.collectPoints());
    }
    return points;
  }

  reset(): void {
    for (const c of this.counters) {
      c.reset();
    }
    for (const h of this.histograms) {
      h.reset();
    }
  }
}

/** Create a metrics registry */
export function createMetricsRegistry(): MetricsRegistry {
  return new MetricsRegistryImpl();
}
