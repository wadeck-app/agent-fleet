/**
 * Global type definitions for E2E tests
 */

interface Window {
	__lastToast?: {
		type: 'success' | 'error' | 'info' | 'warning';
		message: string;
	};
}
