/**
 * Connection ID Management
 *
 * Centralized management of connection IDs (connId) for multi-tab support.
 *
 * Why window.name instead of sessionStorage?
 * - sessionStorage is COPIED when duplicating tabs → same connId → bug!
 * - window.name is NOT copied when duplicating tabs → unique connId 
 * - window.name persists across page refresh → same connId after F5 
 *
 * Architecture:
 * - Single source of truth for connId management
 * - Used by TransportManager, transport clients, and API layer
 * - Ensures consistent connId across the application
 *
 * @example
 * ```typescript
 * import { getConnId, clearConnId } from './connection-id';
 *
 * // Get or generate connId
 * const connId = getConnId();
 *
 * // Clear connId (for tests/cleanup)
 * clearConnId();
 * ```
 */

/**
 * Generate a UUID v4 (with fallback for non-secure contexts)
 *
 * Uses crypto.randomUUID() when available (HTTPS or localhost),
 * falls back to a custom implementation for HTTP over IP addresses.
 *
 * @returns UUID v4 string
 */
function generateUUID(): string {
	// Try to use crypto.randomUUID() if available (secure context: HTTPS or localhost)
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	// Fallback for non-secure contexts (HTTP over IP address)
	// Generate UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Get or generate connection ID (unique per tab)
 *
 * Returns existing connId from window.name, or generates a new one if not found.
 * Each browser tab has a unique connId, even when duplicated.
 *
 * @returns Connection ID (UUID v4)
 */
export function getConnId(): string {
	// Try to get existing connId from window.name
	const existingConnId = window.name;

	if (existingConnId) {
		return existingConnId;
	}

	// Generate new connId and store in window.name
	const newConnId = generateUUID();
	window.name = newConnId;
	console.log('[ConnectionId] Generated new connId:', newConnId.substring(0, 8) + '...');
	return newConnId;
}

/**
 * Clear connection ID
 *
 * Removes connId from window.name.
 * Used for cleanup in tests or app shutdown.
 */
export function clearConnId(): void {
	window.name = '';
	console.log('[ConnectionId] Cleared connId');
}
