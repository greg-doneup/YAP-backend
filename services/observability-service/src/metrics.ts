import { Counter, Histogram, Registry } from "prom-client";

export const registry = new Registry();

export const requests = new Counter({
  name: "obs_requests_total",
  help: "HTTP requests by route and status",
  labelNames: ["route", "code"],
  registers: [registry],
});

export const ingestEvents = new Counter({
  name: "usage_events_total",
  help: "Number of usage events ingested",
  labelNames: ["service"],
  registers: [registry],
});

export const ingestLatency = new Histogram({
  name: "usage_ingest_latency_ms",
  help: "Latency of ingest handler",
  buckets: [10, 50, 100, 250, 500],
  registers: [registry],
});
