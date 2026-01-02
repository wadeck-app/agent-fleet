import { randomUUID } from 'crypto';
import type {
	Intervention,
	InterventionConfig,
	InterventionSource,
	InterventionStatus,
	InterventionTimeout,
	InterventionType,
} from 'shared-orch-worker/domain-types';

import { Storage } from './Storage';
import type { TaskManager } from './TaskManager';

/**
 * InterventionManager
 *
 * Manages user interventions throughout their lifecycle:
 * - Creating intervention requests from flows or agents
 * - Tracking pending interventions
 * - Handling user responses
 * - Managing timeouts
 * - Coordinating with TaskManager for task status updates
 */
export class InterventionManager {
	private pendingInterventions: Map<string, Intervention> = new Map();
	private timeoutHandles: Map<string, NodeJS.Timeout> = new Map();
	private taskManager: TaskManager;
	private sendResponseCallback?: (
		taskId: string,
		interventionId: string,
		response: {
			value: any;
			comment?: string;
			answeredAt: string;
			answeredBy: string;
		} | null,
		timedOut?: boolean,
		cancelled?: boolean
	) => boolean;

	constructor(taskManager: TaskManager) {
		this.taskManager = taskManager;
	}

	/**
	 * Set the callback for sending intervention responses to workers
	 */
	setSendResponseCallback(
		callback: (
			taskId: string,
			interventionId: string,
			response: {
				value: any;
				comment?: string;
				answeredAt: string;
				answeredBy: string;
			} | null,
			timedOut?: boolean,
			cancelled?: boolean
		) => boolean
	): void {
		this.sendResponseCallback = callback;
	}

	/**
	 * Create a new intervention request
	 */
	async createIntervention(params: {
		taskId: string;
		workerId?: string;
		flowId?: string;
		stepId?: string;
		type: InterventionType;
		source: InterventionSource;
		config: InterventionConfig;
		blocking?: boolean;
		timeout?: InterventionTimeout;
	}): Promise<Intervention> {
		const intervention: Intervention = {
			id: randomUUID(),
			taskId: params.taskId,
			workerId: params.workerId,
			flowId: params.flowId,
			stepId: params.stepId,
			type: params.type,
			status: 'pending',
			createdAt: new Date().toISOString(),
			source: params.source,
			config: params.config,
			blocking: params.blocking ?? true,
			timeout: params.timeout,
		};

		// Set timeout if specified
		if (intervention.timeout) {
			const timeoutMs = intervention.timeout.minutes * 60 * 1000;
			intervention.timeoutAt = new Date(Date.now() + timeoutMs).toISOString();

			// Schedule timeout handler
			const handle = setTimeout(() => {
				this.handleTimeout(intervention.id).catch(error => {
					console.error(`[InterventionManager] Failed to handle timeout for ${intervention.id}:`, error);
				});
			}, timeoutMs);

			this.timeoutHandles.set(intervention.id, handle);
		}

		// Save to storage
		await Storage.saveIntervention(intervention);

		// Track in memory
		this.pendingInterventions.set(intervention.id, intervention);

		// Update task status to AWAITING_USER
		await this.taskManager.setTaskIntervention(intervention.taskId, intervention.id);

		console.log(
			`[InterventionManager] Created intervention ${intervention.id} for task ${intervention.taskId} (type: ${intervention.type})`
		);

		return intervention;
	}

	/**
	 * Get an intervention by ID
	 */
	async getIntervention(interventionId: string): Promise<Intervention | null> {
		// Check in-memory cache first
		const cached = this.pendingInterventions.get(interventionId);
		if (cached) {
			return cached;
		}

		// Load from storage
		return await Storage.loadIntervention(interventionId);
	}

	/**
	 * Get all interventions for a task
	 */
	async getInterventionsByTaskId(taskId: string): Promise<Intervention[]> {
		return await Storage.findInterventionsByTaskId(taskId);
	}

	/**
	 * Get pending interventions
	 */
	async getPendingInterventions(): Promise<Intervention[]> {
		return await Storage.findInterventionsByStatus('pending');
	}

	/**
	 * Respond to an intervention
	 */
	async respondToIntervention(
		interventionId: string,
		response: {
			value: any;
			answeredBy: string;
			comment?: string;
		}
	): Promise<Intervention> {
		const intervention = await this.getIntervention(interventionId);
		if (!intervention) {
			throw new Error(`Intervention ${interventionId} not found`);
		}

		if (intervention.status !== 'pending') {
			throw new Error(`Intervention ${interventionId} is not pending (status: ${intervention.status})`);
		}

		// Update intervention
		intervention.status = 'answered';
		intervention.answeredAt = new Date().toISOString();
		intervention.response = {
			...response,
			answeredAt: intervention.answeredAt,
		};

		// Save to storage
		await Storage.saveIntervention(intervention);

		// Remove from pending and cancel timeout
		this.pendingInterventions.delete(interventionId);
		this.cancelTimeout(interventionId);

		// Send response to worker if callback is set
		if (this.sendResponseCallback) {
			const sent = this.sendResponseCallback(
				intervention.taskId,
				interventionId,
				{
					value: response.value,
					comment: response.comment,
					answeredAt: intervention.answeredAt,
					answeredBy: response.answeredBy,
				},
				false,
				false
			);
			if (!sent) {
				console.warn(`[InterventionManager] Failed to send response to worker for task ${intervention.taskId}`);
			}
		}

		// Resume task execution
		await this.taskManager.clearTaskIntervention(intervention.taskId, interventionId);

		console.log(`[InterventionManager] Intervention ${interventionId} answered by ${response.answeredBy}`);

		return intervention;
	}

	/**
	 * Cancel an intervention
	 */
	async cancelIntervention(interventionId: string): Promise<void> {
		const intervention = await this.getIntervention(interventionId);
		if (!intervention) {
			throw new Error(`Intervention ${interventionId} not found`);
		}

		intervention.status = 'cancelled';
		await Storage.saveIntervention(intervention);

		this.pendingInterventions.delete(interventionId);
		this.cancelTimeout(interventionId);

		// Send cancellation to worker if callback is set
		if (this.sendResponseCallback) {
			this.sendResponseCallback(intervention.taskId, interventionId, null, false, true);
		}

		console.log(`[InterventionManager] Intervention ${interventionId} cancelled`);
	}

	/**
	 * Handle timeout for an intervention
	 */
	private async handleTimeout(interventionId: string): Promise<void> {
		const intervention = await this.getIntervention(interventionId);
		if (!intervention || intervention.status !== 'pending') {
			return;
		}

		console.log(`[InterventionManager] Intervention ${interventionId} timed out`);

		intervention.status = 'timeout';

		// Apply timeout behavior
		const answeredAt = new Date().toISOString();
		if (intervention.timeout) {
			switch (intervention.timeout.onTimeout) {
				case 'default':
					// Use default value as response
					intervention.response = {
						value: intervention.timeout.defaultValue,
						answeredBy: 'system',
						answeredAt,
						comment: 'Timeout: using default value',
					};
					break;
				case 'continue':
					// Continue with no value
					intervention.response = {
						value: null,
						answeredBy: 'system',
						answeredAt,
						comment: 'Timeout: continuing without value',
					};
					break;
				case 'fail':
					// Fail the intervention (no response)
					break;
			}
		}

		await Storage.saveIntervention(intervention);
		this.pendingInterventions.delete(interventionId);
		this.timeoutHandles.delete(interventionId);

		// Send timeout response to worker if callback is set
		if (this.sendResponseCallback) {
			this.sendResponseCallback(intervention.taskId, interventionId, intervention.response || null, true, false);
		}

		// Resume task execution
		await this.taskManager.clearTaskIntervention(intervention.taskId, interventionId);
	}

	/**
	 * Cancel timeout for an intervention
	 */
	private cancelTimeout(interventionId: string): void {
		const handle = this.timeoutHandles.get(interventionId);
		if (handle) {
			clearTimeout(handle);
			this.timeoutHandles.delete(interventionId);
		}
	}

	/**
	 * Wait for an intervention to be answered (blocking)
	 * Used by flow executor when intervention is blocking
	 */
	async waitForResponse(interventionId: string, maxWaitMs: number = 0): Promise<Intervention> {
		const startTime = Date.now();
		const pollInterval = 1000; // Poll every 1 second

		while (true) {
			const intervention = await this.getIntervention(interventionId);

			if (!intervention) {
				throw new Error(`Intervention ${interventionId} not found`);
			}

			// Check if answered or timed out
			if (intervention.status === 'answered' || intervention.status === 'timeout') {
				return intervention;
			}

			// Check if cancelled
			if (intervention.status === 'cancelled') {
				throw new Error(`Intervention ${interventionId} was cancelled`);
			}

			// Check max wait time
			if (maxWaitMs > 0 && Date.now() - startTime > maxWaitMs) {
				throw new Error(`Intervention ${interventionId} wait timeout exceeded`);
			}

			// Wait before polling again
			await new Promise(resolve => setTimeout(resolve, pollInterval));
		}
	}

	/**
	 * Get all pending interventions from memory
	 */
	getPendingInterventionsFromMemory(): Intervention[] {
		return Array.from(this.pendingInterventions.values());
	}

	/**
	 * Load pending interventions from storage into memory
	 * Called on startup to restore state
	 */
	async loadPendingInterventions(): Promise<void> {
		const pending = await Storage.findInterventionsByStatus('pending');

		for (const intervention of pending) {
			this.pendingInterventions.set(intervention.id, intervention);

			// Re-establish timeout if needed
			if (intervention.timeout && intervention.timeoutAt) {
				const timeoutMs = new Date(intervention.timeoutAt).getTime() - Date.now();

				if (timeoutMs > 0) {
					const handle = setTimeout(() => {
						this.handleTimeout(intervention.id).catch(error => {
							console.error(
								`[InterventionManager] Failed to handle timeout for ${intervention.id}:`,
								error
							);
						});
					}, timeoutMs);

					this.timeoutHandles.set(intervention.id, handle);
				} else {
					// Already timed out, handle immediately
					await this.handleTimeout(intervention.id);
				}
			}
		}

		console.log(`[InterventionManager] Loaded ${pending.length} pending interventions from storage`);
	}

	/**
	 * Cleanup all timeouts (called on shutdown)
	 */
	cleanup(): void {
		for (const handle of this.timeoutHandles.values()) {
			clearTimeout(handle);
		}
		this.timeoutHandles.clear();
		this.pendingInterventions.clear();
	}
}
