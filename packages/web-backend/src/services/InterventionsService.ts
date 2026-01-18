import type {
	BulkCancelResponse,
	Intervention,
	InterventionResponseSubmit,
	InterventionsListResponse,
	InterventionsQuery,
	SuccessResponse,
} from '@app/shared/api/interventions.contract';
import { B2F_INTERVENTIONS_UPDATED, B2F_INTERVENTION_ANSWERED, B2F_INTERVENTION_CREATED } from '@app/shared/transport';

import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

/**
 * ===========================================================================================
 * INTERVENTIONS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for user interventions.
 * Responsibilities:
 * - Fetch interventions from orchestrator
 * - Filter and paginate interventions
 * - Handle user responses
 * - Emit real-time events for intervention state changes
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 *
 * ===========================================================================================
 */

export class InterventionsService {
	constructor(
		private readonly orchestratorRepository: OrchestratorRepository,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

	/**
	 * Get interventions with optional filtering and pagination
	 * TODO: Wire up with InterventionManager once integrated in Orchestrator
	 */
	async getInterventions(query?: InterventionsQuery): Promise<InterventionsListResponse> {
		try {
			console.log('[InterventionsService] Fetching interventions from orchestrator with query:', query);

			// Fetch and filter interventions
			const interventions: Intervention[] = await this.fetchInterventionsFromOrchestrator(query);

			console.log(`[InterventionsService] Found ${interventions.length} interventions after filtering`);

			// Apply sorting
			const sortBy = query?.sortBy || 'createdAt';
			const sortOrder = query?.sortOrder || 'desc';

			interventions.sort((a, b) => {
				let aVal: any = a[sortBy as keyof Intervention];
				let bVal: any = b[sortBy as keyof Intervention];

				// Handle date comparisons
				if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
					aVal = new Date(aVal as string).getTime();
					bVal = new Date(bVal as string).getTime();
				}

				// Handle boolean comparisons
				if (typeof aVal === 'boolean') {
					aVal = aVal ? 1 : 0;
					bVal = bVal ? 1 : 0;
				}

				// Compare
				if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
				if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
				return 0;
			});

			// Apply pagination
			const page = query?.page || 1;
			const pageSize = query?.pageSize || 10;
			const start = (page - 1) * pageSize;
			const end = start + pageSize;

			const paginatedItems = interventions.slice(start, end);

			return {
				items: paginatedItems,
				pagination: {
					total: interventions.length,
					page,
					pageSize,
					totalPages: Math.ceil(interventions.length / pageSize),
				},
			};
		} catch (error) {
			console.error('[InterventionsService] Error fetching interventions:', error);
			throw error;
		}
	}

	/**
	 * Get a single intervention by ID
	 */
	async getIntervention(interventionId: string): Promise<Intervention | null> {
		try {
			console.log(`[InterventionsService] Fetching intervention ${interventionId}...`);

			// Get from orchestrator via repository
			const rawIntervention = await this.orchestratorRepository.getIntervention(interventionId);
			if (!rawIntervention) {
				return null;
			}

			// Transform to match API contract (add missing BaseEntity fields)
			const intervention: Intervention = {
				...rawIntervention,
				version: 1, // Interventions don't have versioning yet
				updatedAt: rawIntervention.answeredAt || rawIntervention.createdAt, // Use answeredAt if available, else createdAt
			};

			return intervention;
		} catch (error) {
			console.error(`[InterventionsService] Error fetching intervention ${interventionId}:`, error);
			throw error;
		}
	}

	/**
	 * Respond to an intervention
	 */
	async respondToIntervention(
		interventionId: string,
		response: InterventionResponseSubmit
	): Promise<SuccessResponse> {
		try {
			console.log(`[InterventionsService] Responding to intervention ${interventionId}...`);

			// Call orchestrator to submit response
			// Note: answeredBy should be set from authenticated user context (future enhancement)
			await this.orchestratorRepository.respondToIntervention(interventionId, {
				value: response.value,
				answeredBy: 'web-user', // TODO: Get from authenticated user context
				comment: response.comment,
			});

			console.log(`[InterventionsService] Intervention ${interventionId} answered successfully`);

			// Emit events for real-time updates
			try {
				// Get updated intervention from orchestrator after update
				const intervention = await this.getIntervention(interventionId);
				if (intervention) {
					await this.eventBroadcaster.broadcast(B2F_INTERVENTION_ANSWERED, intervention);
				}
				// Broadcast updated list
				const allInterventions = await this.fetchInterventionsFromOrchestrator();
				await this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, allInterventions);
			} catch (broadcastError) {
				console.error(
					'[InterventionsService] Failed to broadcast intervention answered event:',
					broadcastError
				);
			}

			return {
				success: true,
				message: 'Intervention answered successfully',
			};
		} catch (error) {
			console.error(`[InterventionsService] Error responding to intervention ${interventionId}:`, error);
			throw error;
		}
	}

	/**
	 * Cancel an intervention
	 */
	async cancelIntervention(interventionId: string): Promise<SuccessResponse> {
		try {
			console.log(`[InterventionsService] Cancelling intervention ${interventionId}...`);

			// TODO: Call orchestrator to cancel
			console.log(`[InterventionsService] Intervention ${interventionId} cancelled`);

			// Emit events
			try {
				// Broadcast updated list
				const allInterventions = await this.fetchInterventionsFromOrchestrator();
				await this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, allInterventions);
			} catch (broadcastError) {
				console.error(
					'[InterventionsService] Failed to broadcast intervention cancelled event:',
					broadcastError
				);
			}

			return {
				success: true,
				message: 'Intervention cancelled successfully',
			};
		} catch (error) {
			console.error(`[InterventionsService] Error cancelling intervention ${interventionId}:`, error);
			throw error;
		}
	}

	/**
	 * Bulk cancel multiple interventions
	 */
	async bulkCancelInterventions(ids: string[]): Promise<BulkCancelResponse> {
		console.log(`[InterventionsService] Bulk cancelling ${ids.length} interventions...`);

		const cancelled: string[] = [];
		const failed: Array<{ id: string; error: string }> = [];

		// Process each cancellation
		for (const id of ids) {
			try {
				await this.cancelIntervention(id);
				cancelled.push(id);
			} catch (error) {
				console.error(`[InterventionsService] Failed to cancel intervention ${id}:`, error);
				failed.push({
					id,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		console.log(
			`[InterventionsService] Bulk cancel completed: ${cancelled.length} succeeded, ${failed.length} failed`
		);

		return {
			cancelled,
			failed,
		};
	}

	/**
	 * Fetch interventions from orchestrator with filtering
	 */
	private async fetchInterventionsFromOrchestrator(query?: InterventionsQuery): Promise<Intervention[]> {
		// Fetch from orchestrator via repository
		const rawInterventions = await this.orchestratorRepository.getInterventions();

		// Transform to match API contract (add missing BaseEntity fields)
		let interventions: Intervention[] = rawInterventions.map(intervention => ({
			...intervention,
			version: 1, // Interventions don't have versioning yet
			updatedAt: intervention.answeredAt || intervention.createdAt, // Use answeredAt if available, else createdAt
		}));

		// Apply filters
		if (query?.status) {
			interventions = interventions.filter(i => i.status === query.status);
		}

		if (query?.type) {
			interventions = interventions.filter(i => i.type === query.type);
		}

		if (query?.blocking !== undefined) {
			interventions = interventions.filter(i => i.blocking === query.blocking);
		}

		if (query?.taskId) {
			const taskIdLower = query.taskId.toLowerCase();
			interventions = interventions.filter(i => i.taskId.toLowerCase().includes(taskIdLower));
		}

		// Apply search filter (searches across multiple fields)
		if (query?.search) {
			const searchLower = query.search.toLowerCase();
			interventions = interventions.filter(
				i =>
					i.id.toLowerCase().includes(searchLower) ||
					i.taskId.toLowerCase().includes(searchLower) ||
					i.config.title.toLowerCase().includes(searchLower) ||
					i.config.description?.toLowerCase().includes(searchLower) ||
					i.type.toLowerCase().includes(searchLower) ||
					i.status.toLowerCase().includes(searchLower)
			);
		}

		return interventions;
	}

	/**
	 * Emit intervention created event (called by orchestrator when intervention is created)
	 */
	async emitInterventionCreated(interventionId: string): Promise<void> {
		try {
			// Get actual intervention from orchestrator (already transformed in getIntervention)
			const intervention = await this.getIntervention(interventionId);
			if (intervention) {
				await this.eventBroadcaster.broadcast(B2F_INTERVENTION_CREATED, intervention);
			}
			// Broadcast updated list (already transformed in fetchInterventionsFromOrchestrator)
			const allInterventions = await this.fetchInterventionsFromOrchestrator();
			await this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, allInterventions);
		} catch (error) {
			console.error('[InterventionsService] Failed to broadcast intervention created event:', error);
		}
	}
}
