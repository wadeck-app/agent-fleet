/**
 * ===========================================================================================
 * CONTROLLER REGISTRY - Global registry for lazy-loaded controllers
 * ===========================================================================================
 *
 * This registry stores initialization functions for each controller.
 * Controllers are initialized on-demand:
 * - When the first request hits their route (wildcard handler)
 * - When the /api endpoint is called (to list all available routes)
 *
 * Benefits:
 * - Zero imports at startup (instant boot)
 * - Perfect for tests (only load controllers you use)
 * - /api endpoint can list all routes by initializing all controllers
 *
 * ===========================================================================================
 */

/**
 * Global registry: baseUrl → initialization function
 *
 * Example:
 *   CONTROLLER_REGISTRY.set('/api/books', async () => { ... initialize books controller ... });
 */
export const CONTROLLER_REGISTRY = new Map<string, () => Promise<void>>();
