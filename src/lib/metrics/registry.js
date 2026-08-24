import os from 'node:os';
import client from 'prom-client';

/**
 * Prometheus instrumentation for Wayfinder. The HTTP histogram matches the
 * metric name and labels queried by OBACloud's per-organization dashboards.
 */

function createMetrics() {
	const registry = new client.Registry();
	client.collectDefaultMetrics({ register: registry });

	const httpDuration = new client.Histogram({
		name: 'http_server_requests_seconds',
		help: 'HTTP server request duration in seconds.',
		labelNames: ['service', 'organization', 'method', 'uri', 'status'],
		buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
		registers: [registry]
	});

	new client.Gauge({
		name: 'system_cpu_load_average_1m',
		help: 'System load average over the last minute.',
		registers: [registry],
		collect() {
			this.set(os.loadavg()[0]);
		}
	});

	new client.Gauge({
		name: 'system_memory_total_bytes',
		help: 'Total system memory in bytes.',
		registers: [registry],
		collect() {
			this.set(os.totalmem());
		}
	});

	new client.Gauge({
		name: 'system_memory_free_bytes',
		help: 'Free system memory in bytes.',
		registers: [registry],
		collect() {
			this.set(os.freemem());
		}
	});

	return { registry, httpDuration };
}

// Stored on globalThis so dev-mode HMR re-evaluation neither double-registers
// metrics nor orphans the registry held by the running metrics server.
const metrics = (globalThis.__wayfinderMetrics ??= createMetrics());

export const metricsContentType = metrics.registry.contentType;

export function recordHttpRequest({ method, organization, route, status, durationSeconds }) {
	metrics.httpDuration.observe(
		{
			service: 'wayfinder',
			organization,
			method,
			uri: route,
			status: String(status)
		},
		durationSeconds
	);
}

export function renderMetrics() {
	return metrics.registry.metrics();
}
