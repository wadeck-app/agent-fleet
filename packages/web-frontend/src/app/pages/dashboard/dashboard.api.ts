import { createTypedFetch } from '@framework/api/api-base';
import { DASHBOARD_API_ROUTES } from '@shared/api/dashboard.contract';

console.log('[dashboard.api] DASHBOARD_API_ROUTES loaded:', DASHBOARD_API_ROUTES);
console.log('[dashboard.api] Routes keys:', Object.keys(DASHBOARD_API_ROUTES));

const typedFetch = createTypedFetch(DASHBOARD_API_ROUTES);

export const dashboardApi = {
	getDashboard: () => {
		console.log('[dashboardApi] getDashboard() called - calling typedFetch');
		const result = typedFetch('GET', '/api/dashboard/', {});
		console.log('[dashboardApi] typedFetch returned:', result);
		return result;
	},
} as const;
