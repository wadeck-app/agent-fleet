import type {
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
			console.log('[InterventionsService] Fetching interventions from orchestrator...');

			// TODO: Get interventions from orchestrator
			// For now, return mock data for UI development
			const interventions: Intervention[] = await this.fetchInterventionsFromOrchestrator(query);

			console.log(`[InterventionsService] Found ${interventions.length} interventions`);

			// Sort by createdAt desc (newest first)
			interventions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

			// TODO: Get from orchestrator
			const interventions = await this.fetchInterventionsFromOrchestrator();
			return interventions.find(i => i.id === interventionId) || null;
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

			// TODO: Call orchestrator to submit response
			// For now, just emit events
			console.log(`[InterventionsService] Intervention ${interventionId} answered with:`, response);

			// Emit events for real-time updates
			try {
				// TODO: Get actual intervention from orchestrator after update
				// For now, fetch current state to broadcast
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
	 * Fetch interventions from orchestrator
	 * TODO: Wire up with actual InterventionManager
	 */
	private async fetchInterventionsFromOrchestrator(query?: InterventionsQuery): Promise<Intervention[]> {
		// For now, return empty array
		// This will be wired up once Orchestrator has InterventionManager integrated
		return [];
	}

	/**
	 * Emit intervention created event (called by orchestrator when intervention is created)
	 */
	async emitInterventionCreated(interventionId: string): Promise<void> {
		try {
			// TODO: Get actual intervention from orchestrator
			const intervention = await this.getIntervention(interventionId);
			if (intervention) {
				await this.eventBroadcaster.broadcast(B2F_INTERVENTION_CREATED, intervention);
			}
			// Broadcast updated list
			const allInterventions = await this.fetchInterventionsFromOrchestrator();
			await this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, allInterventions);
		} catch (error) {
			console.error('[InterventionsService] Failed to broadcast intervention created event:', error);
		}
	}
}
