/**
 * Connection ID Management
 *
 * Centralized management of connection IDs (connId) for multi-tab support.
 *
 * Why window.name instead of sessionStorage?
 * - sessionStorage is COPIED when duplicating tabs → same connId → bug!
 * - window.name is NOT copied when duplicating tabs → unique connId ✓
 * - window.name persists across page refresh → same connId after F5 ✓
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
	const newConnId = crypto.randomUUID();
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
