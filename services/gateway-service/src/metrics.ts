import { Counter, Registry } from "prom-client";
export const registry = new Registry();

export const gatewayRequests = new Counter({
  name: "gateway_requests_total",
  help: "count of requests by route and status",
  labelNames: ["route", "code"],
  registers: [registry],
});
