import { Orchestrator } from 'orchestrator';

import { DataStoreFactory } from '../factories/DataStoreFactory';

/**
 * ===========================================================================================
 * GLOBAL FACTORY INSTANCE - Singleton
 * ===========================================================================================
 *
 * Provides a global instance of DataStoreFactory for dependency injection.
 * This allows lazy-loaded controllers to access services without explicit passing.
 *
 * The factory is initialized in server.ts before any controllers are loaded.
 *
 * ===========================================================================================
 */

let factoryInstance: DataStoreFactory | null = null;

/**
 * Initialize the global factory instance
 * Must be called once during server startup
 */
export function initializeFactory(
	storageMode: 'memory' | 'mariadb' = 'memory',
	orchestrator: Orchestrator
): DataStoreFactory {
	if (factoryInstance) {
		throw new Error('Factory already initialized');
	}
	factoryInstance = new DataStoreFactory(storageMode, orchestrator);
	return factoryInstance;
}

/**
 * Get the global factory instance
 * Throws if not initialized
 */
export function getFactory(): DataStoreFactory {
	if (!factoryInstance) {
		throw new Error('Factory not initialized. Call initializeFactory() first.');
	}
	return factoryInstance;
}
