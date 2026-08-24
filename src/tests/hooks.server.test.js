import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRecordHttpRequest = vi.fn();
const mockRenderMetrics = vi.fn().mockResolvedValue('# metrics');
let mockMetricsEnv = {
	PUBLIC_METRICS_ENABLED: 'true',
	PUBLIC_METRICS_ORGANIZATION: 'Sound Transit'
};

vi.mock('$env/dynamic/public', () => ({
	get env() {
		return mockMetricsEnv;
	}
}));
vi.mock('$lib/serverCache.js', () => ({
	preloadRoutesData: vi.fn().mockResolvedValue(undefined),
	getRoutesCache: vi.fn(),
	getAgenciesCache: vi.fn(),
	getBoundsCache: vi.fn()
}));
vi.mock('$lib/otpServerCache.js', () => ({
	preloadOtpVersion: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/metrics/registry.js', () => ({
	metricsContentType: 'text/plain; version=0.0.4',
	recordHttpRequest: mockRecordHttpRequest,
	renderMetrics: mockRenderMetrics
}));

function makeEvent({ method = 'GET', routeId = '/stops/[stopID]' } = {}) {
	return {
		request: new Request('http://localhost/stops/1_100', { method }),
		route: { id: routeId },
		url: new URL('http://localhost/stops/1_100')
	};
}

describe('hooks.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockMetricsEnv = {
			PUBLIC_METRICS_ENABLED: 'true',
			PUBLIC_METRICS_ORGANIZATION: 'Sound Transit'
		};
	});

	it('records method, route template, status, and duration for each request', async () => {
		vi.resetModules();
		const { handle } = await import('../hooks.server.js');
		const response = new Response('ok', { status: 200 });
		const resolve = vi.fn().mockResolvedValue(response);

		const result = await handle({ event: makeEvent(), resolve });

		expect(result).toBe(response);
		expect(mockRecordHttpRequest).toHaveBeenCalledWith({
			method: 'GET',
			organization: 'Sound Transit',
			route: '/stops/[stopID]',
			status: 200,
			durationSeconds: expect.any(Number)
		});
	});

	it('labels unmatched routes as (unmatched)', async () => {
		vi.resetModules();
		const { handle } = await import('../hooks.server.js');
		const resolve = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

		await handle({ event: makeEvent({ routeId: null }), resolve });

		expect(mockRecordHttpRequest).toHaveBeenCalledWith(
			expect.objectContaining({ route: '(unmatched)', status: 404 })
		);
	});

	it('records a 500 and rethrows when resolve fails', async () => {
		vi.resetModules();
		const { handle } = await import('../hooks.server.js');
		const boom = new Error('boom');
		const resolve = vi.fn().mockRejectedValue(boom);

		await expect(handle({ event: makeEvent(), resolve })).rejects.toThrow(boom);
		expect(mockRecordHttpRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }));
	});

	it('serves Prometheus metrics from the app-server endpoint', async () => {
		vi.resetModules();
		const { handle } = await import('../hooks.server.js');
		const resolve = vi.fn();

		const response = await handle({
			event: { ...makeEvent(), url: new URL('http://localhost/metrics') },
			resolve
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/plain; version=0.0.4');
		expect(await response.text()).toBe('# metrics');
		expect(resolve).not.toHaveBeenCalled();
		expect(mockRecordHttpRequest).not.toHaveBeenCalled();
	});

	it('does not mount /metrics when metrics are disabled', async () => {
		mockMetricsEnv = { PUBLIC_METRICS_ENABLED: 'false', PUBLIC_METRICS_ORGANIZATION: '' };
		vi.resetModules();
		const { handle } = await import('../hooks.server.js');
		const resolve = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));

		const response = await handle({
			event: { ...makeEvent(), url: new URL('http://localhost/metrics') },
			resolve
		});

		expect(response.status).toBe(404);
		expect(resolve).toHaveBeenCalledOnce();
		expect(mockRecordHttpRequest).not.toHaveBeenCalled();
	});

	it('refuses to start with enabled metrics and no organization', async () => {
		mockMetricsEnv = { PUBLIC_METRICS_ENABLED: 'true', PUBLIC_METRICS_ORGANIZATION: '  ' };
		vi.resetModules();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(import('../hooks.server.js')).rejects.toThrow(
			'PUBLIC_METRICS_ORGANIZATION must be set when PUBLIC_METRICS_ENABLED=true.'
		);
		expect(error).toHaveBeenCalledWith(
			'PUBLIC_METRICS_ORGANIZATION must be set when PUBLIC_METRICS_ENABLED=true.'
		);
		error.mockRestore();
	});
});
