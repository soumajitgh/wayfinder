# Prometheus Metrics for Wayfinder — Design

**Date:** 2026-07-02
**Status:** Implemented

## Goal

Expose Prometheus metrics from the Wayfinder application server so OBACloud's
per-organization Grafana dashboards can show request rate and p95 latency.

## Configuration

- `PUBLIC_METRICS_ENABLED` — only the string `"true"` enables metrics; the
  default is disabled.
- `PUBLIC_METRICS_ORGANIZATION` — the exact OBACloud `Organization.name` to
  attach to every application HTTP metric.

Both values are read at runtime using `$env/dynamic/public`. When metrics are
enabled and the organization is blank, Wayfinder fails at startup with a clear
configuration error. This avoids silently exposing metrics whose labels cannot
match OBACloud dashboard queries.

## Endpoint and instrumentation

`src/hooks.server.js` serves `GET /metrics` with the Prometheus text
exposition content type when metrics are enabled. It does not mount the
endpoint otherwise, allowing the normal SvelteKit 404 response.

The hook also records every application request (excluding the scrape request)
in this histogram:

```
http_server_requests_seconds{
  service="wayfinder",
  organization="<OBACloud Organization.name>",
  method="GET",
  uri="/stops/[stopID]",
  status="200"
}
```

`uri` uses `event.route.id`, rather than the raw URL path, to keep Prometheus
label cardinality bounded. Missing route IDs are reported as `(unmatched)`.
The histogram creates the `_bucket`, `_sum`, and `_count` series used by the
existing Grafana request-rate and latency panels.

## Registry

`src/lib/metrics/registry.js` owns a `prom-client` registry. Alongside the
HTTP histogram it collects Node/process metrics and system CPU/memory gauges.
The registry is stored on `globalThis` so Vite HMR cannot double-register
metrics during development.

## Dashboard queries

- Request rate: `rate(http_server_requests_seconds_count{service="wayfinder",organization="<Org Name>"}[5m])`
- Response p95: `histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{service="wayfinder",organization="<Org Name>"}[5m])) by (le))`

## Testing

Tests cover registry exposition and labels, route-template instrumentation,
the app-server endpoint, disabled endpoint behavior, and invalid enabled
configuration.
