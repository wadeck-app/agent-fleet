export type ToastType = 'success' | 'error' | 'info' | 'warning';

/**
 * Toast Event Store for E2E Testing
 *
 * Stores toast events in window so E2E tests can verify them
 * deterministically, without depending on the ephemeral display
 * of toasts in the DOM.
 */

export interface ToastEvent {
	type: ToastType;
	message: string;
	timestamp: number;
}

declare global {
	interface Window {
		__toastEvents?: ToastEvent[];
		__lastToast?: ToastEvent;
	}
}

/**
 * Record a toast event
 * Called automatically when a toast is displayed
 */
export function recordToastEvent(type: ToastType, message: string): void {
	// Only store if in test mode (defined by E2E tests)
	if (typeof window === 'undefined' || !window.location.hostname.includes('localhost')) {
		return;
	}

	const event: ToastEvent = {
		type,
		message,
		timestamp: Date.now(),
	};

	// Initialize store if needed
	if (!window.__toastEvents) {
		window.__toastEvents = [];
	}

	// Add event
	window.__toastEvents.push(event);

	// Keep only last 50 events to avoid memory leaks
	if (window.__toastEvents.length > 50) {
		window.__toastEvents = window.__toastEvents.slice(-50);
	}

	// Update last toast (for simple tests)
	window.__lastToast = event;
}

/**
 * Reset toast events
 * Useful for tests that want a clean state
 */
export function clearToastEvents(): void {
	if (typeof window !== 'undefined') {
		window.__toastEvents = [];
		window.__lastToast = undefined;
	}
}

/**
 * Get all toast events
 */
export function getToastEvents(): ToastEvent[] {
	return typeof window !== 'undefined' && window.__toastEvents ? [...window.__toastEvents] : [];
}

/**
 * Get the last toast event
 */
export function getLastToast(): ToastEvent | undefined {
	return typeof window !== 'undefined' ? window.__lastToast : undefined;
}

/**
 * Check if a success toast was displayed recently
 * @param maxAge - Maximum age in ms (default: 5000ms = 5s)
 */
export function hasRecentSuccessToast(maxAge: number = 5000): boolean {
	const last = getLastToast();
	if (!last || last.type !== 'success') return false;
	return Date.now() - last.timestamp < maxAge;
}

/**
 * Check if an error toast was displayed recently
 * @param maxAge - Maximum age in ms (default: 5000ms = 5s)
 */
export function hasRecentErrorToast(maxAge: number = 5000): boolean {
	const last = getLastToast();
	if (!last || last.type !== 'error') return false;
	return Date.now() - last.timestamp < maxAge;
}
