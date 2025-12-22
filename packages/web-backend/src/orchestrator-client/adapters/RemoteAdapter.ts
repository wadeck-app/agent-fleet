/**
 * Remote Mode Adapter (stub - to be implemented in Phase 5)
 */
import type { OrchestratorClient } from '../OrchestratorClient.js';
import type { RemoteOrchestratorClientConfig } from '../OrchestratorClientConfig.js';

export class RemoteOrchestratorAdapter implements OrchestratorClient {
	constructor(config: RemoteOrchestratorClientConfig) {
		throw new Error('RemoteOrchestratorAdapter not yet implemented');
	}

	async createTask(): Promise<any> {
		throw new Error('Not implemented');
	}

	async getTask(): Promise<any> {
		throw new Error('Not implemented');
	}

	async getTasks(): Promise<any> {
		throw new Error('Not implemented');
	}

	async getWorkers(): Promise<any> {
		throw new Error('Not implemented');
	}

	async getStats(): Promise<any> {
		throw new Error('Not implemented');
	}

	async updateConfig(): Promise<void> {
		throw new Error('Not implemented');
	}

	async renameWorker(): Promise<void> {
		throw new Error('Not implemented');
	}

	on(): void {
		throw new Error('Not implemented');
	}

	off(): void {
		throw new Error('Not implemented');
	}

	async connect(): Promise<void> {
		throw new Error('Not implemented');
	}

	async disconnect(): Promise<void> {
		throw new Error('Not implemented');
	}
}
