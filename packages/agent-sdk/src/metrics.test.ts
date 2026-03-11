import { describe, it, expect } from "vitest";
import { createMetricsRegistry } from "./metrics.js";

describe("createMetricsRegistry", () => {
  describe("Counter", () => {
    it("should increment by 1 by default", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("requests_total", "Total requests");
      counter.inc();
      expect(counter.get()).toBe(1);
    });

    it("should increment by the specified value", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("bytes_total", "Total bytes");
      counter.inc(undefined, 100);
      counter.inc(undefined, 50);
      expect(counter.get()).toBe(150);
    });

    it("should support labels", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("http_requests", "HTTP requests");
      counter.inc({ method: "GET" });
      counter.inc({ method: "POST" });
      counter.inc({ method: "GET" });
      expect(counter.get({ method: "GET" })).toBe(2);
      expect(counter.get({ method: "POST" })).toBe(1);
    });

    it("should return 0 for untracked labels", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("events", "Events");
      expect(counter.get({ type: "unknown" })).toBe(0);
    });

    it("should support multiple labels combined", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("api_calls", "API calls");
      counter.inc({ method: "GET", path: "/users" }, 3);
      counter.inc({ method: "GET", path: "/rooms" }, 5);
      expect(counter.get({ method: "GET", path: "/users" })).toBe(3);
      expect(counter.get({ method: "GET", path: "/rooms" })).toBe(5);
    });
  });

  describe("Histogram", () => {
    it("should track observed values count", () => {
      const registry = createMetricsRegistry();
      const hist = registry.histogram("request_duration", "Request duration");
      hist.observe(0.1);
      hist.observe(0.2);
      hist.observe(0.3);
      expect(hist.getCount()).toBe(3);
    });

    it("should track observed values sum", () => {
      const registry = createMetricsRegistry();
      const hist = registry.histogram("response_size", "Response size");
      hist.observe(100);
      hist.observe(200);
      expect(hist.getSum()).toBe(300);
    });

    it("should support labels for observations", () => {
      const registry = createMetricsRegistry();
      const hist = registry.histogram("latency", "Latency");
      hist.observe(0.5, { endpoint: "/api" });
      hist.observe(1.0, { endpoint: "/api" });
      hist.observe(0.1, { endpoint: "/health" });
      expect(hist.getCount({ endpoint: "/api" })).toBe(2);
      expect(hist.getSum({ endpoint: "/api" })).toBe(1.5);
      expect(hist.getCount({ endpoint: "/health" })).toBe(1);
      expect(hist.getSum({ endpoint: "/health" })).toBe(0.1);
    });

    it("should return 0 for untracked labels", () => {
      const registry = createMetricsRegistry();
      const hist = registry.histogram("duration", "Duration");
      expect(hist.getCount({ path: "/unknown" })).toBe(0);
      expect(hist.getSum({ path: "/unknown" })).toBe(0);
    });
  });

  describe("Registry", () => {
    it("should create counters", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("test_counter", "A test counter");
      expect(counter).toBeDefined();
      counter.inc();
      expect(counter.get()).toBe(1);
    });

    it("should create histograms", () => {
      const registry = createMetricsRegistry();
      const hist = registry.histogram("test_hist", "A test histogram");
      expect(hist).toBeDefined();
      hist.observe(42);
      expect(hist.getCount()).toBe(1);
    });

    it("should collect all metric points from counters", () => {
      const registry = createMetricsRegistry();
      const c1 = registry.counter("c1", "Counter 1");
      const c2 = registry.counter("c2", "Counter 2");
      c1.inc();
      c2.inc(undefined, 5);
      const points = registry.collect();
      expect(points).toHaveLength(2);
      expect(points.find((p) => p.name === "c1")?.value).toBe(1);
      expect(points.find((p) => p.name === "c2")?.value).toBe(5);
    });

    it("should collect all metric points from histograms", () => {
      const registry = createMetricsRegistry();
      const hist = registry.histogram("latency", "Latency");
      hist.observe(0.5);
      hist.observe(1.5);
      const points = registry.collect();
      expect(points).toHaveLength(2);
      expect(points.find((p) => p.name === "latency_count")?.value).toBe(2);
      expect(points.find((p) => p.name === "latency_sum")?.value).toBe(2.0);
    });

    it("should collect mixed counters and histograms", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("reqs", "Requests");
      const hist = registry.histogram("dur", "Duration");
      counter.inc();
      hist.observe(10);
      const points = registry.collect();
      expect(points).toHaveLength(3); // 1 counter + 2 histogram (count + sum)
    });

    it("should include timestamp in collected points", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("ts_test", "Timestamp test");
      counter.inc();
      const points = registry.collect();
      expect(points[0].timestamp).toBeGreaterThan(0);
      expect(typeof points[0].timestamp).toBe("number");
    });

    it("should include labels in collected points", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("labeled", "Labeled counter");
      counter.inc({ env: "prod" }, 3);
      const points = registry.collect();
      expect(points[0].labels).toEqual({ env: "prod" });
    });

    it("should reset all metrics when reset() is called", () => {
      const registry = createMetricsRegistry();
      const counter = registry.counter("reset_c", "Resettable counter");
      const hist = registry.histogram("reset_h", "Resettable histogram");
      counter.inc(undefined, 10);
      hist.observe(5);
      registry.reset();
      expect(counter.get()).toBe(0);
      expect(hist.getCount()).toBe(0);
      expect(hist.getSum()).toBe(0);
      expect(registry.collect()).toHaveLength(0);
    });
  });
});
