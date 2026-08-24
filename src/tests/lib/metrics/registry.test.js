import { describe, it, expect } from 'vitest';
import { metricsContentType, recordHttpRequest, renderMetrics } from '$lib/metrics/registry.js';

describe('metrics registry', () => {
	it('exposes the Prometheus text exposition content type', () => {
		expect(metricsContentType).toContain('text/plain');
	});

	it('records HTTP requests in the OBACloud dashboard histogram', async () => {
		recordHttpRequest({
			method: 'GET',
			organization: 'Sound Transit',
			route: '/stops/[stopID]',
			status: 200,
			durationSeconds: 0.123
		});

		const text = await renderMetrics();
		expect(text).toContain(
			'http_server_requests_seconds_count{service="wayfinder",organization="Sound Transit",method="GET",uri="/stops/[stopID]",status="200"} 1'
		);
		expect(text).toContain(
			'http_server_requests_seconds_sum{service="wayfinder",organization="Sound Transit",method="GET",uri="/stops/[stopID]",status="200"} 0.123'
		);
		expect(text).toMatch(
			/http_server_requests_seconds_bucket\{le="0\.25",service="wayfinder",organization="Sound Transit",method="GET",uri="\/stops\/\[stopID\]",status="200"\}/
		);
	});

	it('includes Node.js default metrics', async () => {
		const text = await renderMetrics();
		expect(text).toContain('process_cpu_user_seconds_total');
		expect(text).toContain('nodejs_eventloop_lag_seconds');
		expect(text).toContain('process_resident_memory_bytes');
	});

	it('includes system-level gauges for dashboard CPU/memory panels', async () => {
		const text = await renderMetrics();
		expect(text).toMatch(/system_cpu_load_average_1m \d/);
		expect(text).toMatch(/system_memory_total_bytes \d/);
		expect(text).toMatch(/system_memory_free_bytes \d/);
	});
});
