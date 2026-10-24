# Performance Baseline

**Date:** 2026-10-24  
**Target:** local `@edunet/gateway` `/health` (no database access)  
**Tool:** `scripts/perf/baseline.mjs` (Node `fetch`, fixed concurrency)

## Method

```bash
pnpm perf:baseline
```

Defaults: 20 concurrent workers for 5 seconds after a 10-request warm-up.
The script records startup latency, throughput, error count and p50/p95/p99/max
latency. It starts the built gateway on a loopback port and tears it down.

## Result

| Metric     | Value       |
| ---------- | ----------- |
| Requests   | 32,885      |
| Errors     | 0           |
| Throughput | 6,577 req/s |
| Startup    | 156.84 ms   |
| p50        | 2.70 ms     |
| p95        | 6.67 ms     |
| p99        | 14.68 ms    |
| Max        | 19.64 ms    |

## Interpretation and limits

This measures the gateway event loop and `/health` handler only. It does **not**
measure PostgreSQL, service fan-out, AI provider latency, TLS termination,
media transfer, or browser rendering. It is a regression baseline for gateway
overhead, not a capacity claim.

Before a pilot, repeat against staging with:

- representative tenant data and authenticated course/assignment reads;
- the production TLS proxy and container CPU/memory limits;
- a 30-minute soak at expected peak concurrency;
- dashboards for p95, 5xx rate, database connections and AI quota.

Record the staging run in the release record. Do not compare local numbers to
production capacity directly.
