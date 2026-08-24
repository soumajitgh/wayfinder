import 'temporal-polyfill/global';
import { env } from '$env/dynamic/public';
import { preloadRoutesData } from '$lib/serverCache.js';
import { preloadOtpVersion } from '$lib/otpServerCache.js';
import { metricsContentType, recordHttpRequest, renderMetrics } from '$lib/metrics/registry.js';

const metricsEnabled = env.PUBLIC_METRICS_ENABLED === 'true';
const metricsOrganization = env.PUBLIC_METRICS_ORGANIZATION?.trim() ?? '';

if (metricsEnabled && metricsOrganization === '') {
	const message = 'PUBLIC_METRICS_ORGANIZATION must be set when PUBLIC_METRICS_ENABLED=true.';
	console.error(message);
	throw new Error(message);
}

export async function handle({ event, resolve }) {
	if (metricsEnabled && event.url.pathname === '/metrics') {
		return new Response(await renderMetrics(), {
			headers: { 'Content-Type': metricsContentType }
		});
	}

	await Promise.all([preloadRoutesData(), preloadOtpVersion()]);

	const startTime = performance.now();
	let status = 500;
	try {
		const response = await resolve(event);
		status = response.status;
		return response;
	} finally {
		if (metricsEnabled) {
			recordHttpRequest({
				method: event.request.method,
				organization: metricsOrganization,
				route: event.route.id ?? '(unmatched)',
				status,
				durationSeconds: (performance.now() - startTime) / 1000
			});
		}
	}
}

export { getRoutesCache, getAgenciesCache, getBoundsCache } from '$lib/serverCache.js';
