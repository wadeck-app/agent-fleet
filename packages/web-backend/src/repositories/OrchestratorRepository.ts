import type { OrchestratorStats } from '@app/shared-orch-backend';
import { OrchestratorStatsSchema } from '@app/shared-orch-backend';

/**
 * ===========================================================================================
 * ORCHESTRATOR REPOSITORY
 * ===========================================================================================
 *
 * Fetches data from the orchestrator REST API with intelligent caching.
 * Responsibilities:
 * - HTTP requests to orchestrator API
 * - In-memory caching with TTL
 * - Stale cache fallback on errors
 *
 * Does NOT contain:
 * - Business logic (in service)
 * - Data transformation (in service)
 *
 * ===========================================================================================
 */

/**
 * Cache entry structure
 */
interface CacheEntry {
	data: OrchestratorStats | null;
	timestamp: number;
}

export class OrchestratorRepository {
	private cache: CacheEntry = { data: null, timestamp: 0 };

	constructor(
		private readonly orchestratorUrl: string,
		private readonly cacheTtlMs: number = 5000
	) {}

	/**
	 * Get orchestrator stats from API (with caching)
	 * Returns cached data if within TTL
	 * Falls back to stale cache on error if available
	 */
	async getStats(): Promise<OrchestratorStats> {
		const now = Date.now();
		const cacheAge = now - this.cache.timestamp;

		// Return cached data if within TTL
		if (this.cache.data && cacheAge < this.cacheTtlMs) {
			return this.cache.data;
		}

		// Fetch fresh data
		try {
			console.log(`[OrchestratorRepository] Fetching from: ${this.orchestratorUrl}/stats`);
			const response = await fetch(`${this.orchestratorUrl}/stats`);

			if (!response.ok) {
				throw new Error(`Orchestrator API returned ${response.status}: ${response.statusText}`);
			}

			const rawData = await response.json();

			console.log('[OrchestratorRepository] Raw data received:', JSON.stringify(rawData, null, 2));

			// Validate response against schema
			const stats = OrchestratorStatsSchema.parse(rawData);

			// Update cache
			this.cache = {
				data: stats,
				timestamp: now,
			};

			return stats;
		} catch (error) {
			// If we have stale cache, return it instead of throwing
			if (this.cache.data) {
				return this.cache.data;
			}

			// No cache available, propagate error
			throw new Error(
				`Failed to fetch orchestrator stats: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Clear the cache (useful for testing)
	 */
	clearCache(): void {
		this.cache = { data: null, timestamp: 0 };
	}
}
