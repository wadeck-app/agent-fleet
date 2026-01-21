import { createLogger } from 'shared-common/logger';

import type {
	BulkCancelResponse,
	Intervention,
	InterventionResponseSubmit,
	InterventionsListResponse,
	InterventionsQuery,
	SuccessResponse,
} from '@app/shared/api/interventions.contract';
import { B2F_INTERVENTIONS_UPDATED, B2F_INTERVENTION_ANSWERED, B2F_INTERVENTION_CREATED } from '@app/shared/transport';

import type { InterventionsRepository } from '../repositories/InterventionsRepository';
import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

const log = createLogger('InterventionsService');

/**
 * ===========================================================================================
 * INTERVENTIONS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for user interventions.
 * Responsibilities:
 * - Manage interventions using InterventionsRepository (file-based persistence)
 * - Sync intervention state changes to orchestrator (cache invalidation)
 * - Apply sorting and pagination (business logic layer concern)
 * - Handle user responses and cancellations
 * - Emit real-time events for intervention state changes
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 *
 * Persistence Strategy:
 * - Interventions are created by orchestrator and synced to backend via events
 * - Backend persists them to file storage (data/interventions.json)
 * - This ensures interventions survive restarts
 *
 * Cache Synchronization:
 * - Backend is source of truth (file storage)
 * - Orchestrator maintains in-memory cache for fast access
 * - When backend updates intervention (respond/cancel), it notifies orchestrator
 * - Orchestrator updates its cache and notifies waiting workers
 *
 * ===========================================================================================
 */

export class InterventionsService {
	constructor(
		private readonly interventionsRepository: InterventionsRepository,
		private readonly eventBroadcaster: EventBroadcaster,
		private readonly orchestratorRepository: OrchestratorRepository
	) {}

	/**
	 * Get interventions with optional filtering and pagination
	 */
	async getInterventions(query?: InterventionsQuery): Promise<InterventionsListResponse> {
		try {
			log.info(' Fetching interventions with query:', query);

			// Fetch from repository (file-based storage)
			let interventions = await this.interventionsRepository.findAll(query);

			log.info(` Found ${interventions.length} interventions after repository filtering`);

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

			// Apply sorting
			const sortBy = query?.sortBy || 'createdAt';
			const sortOrder = query?.sortOrder || 'desc';

			interventions.sort((a, b) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let aVal: any = a[sortBy as keyof Intervention];
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
			log.error(' Error fetching interventions:', error);
			throw error;
		}
	}

	/**
	 * Create a new intervention
	 * Called by OrchestratorEventHandler when orchestrator creates an intervention
	 */
	async createIntervention(
		data: Omit<Intervention, 'id' | 'version' | 'createdAt' | 'updatedAt'> & { id: string }
	): Promise<Intervention> {
		try {
			log.info(` Creating intervention ${data.id}...`);

			// Create in repository (persists to file)
			// Note: orchestrator has already generated the ID, so we use createWithId
			const { id, ...dataWithoutId } = data;
			const intervention = await this.interventionsRepository.createWithId(id, dataWithoutId);

			log.info(` Intervention ${intervention.id} created successfully`);

			// Emit events for real-time updates
			try {
				this.eventBroadcaster.broadcast(B2F_INTERVENTION_CREATED, intervention);
				// @formatter:off
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, {} as any);
				// @formatter:on
			} catch (broadcastError) {
				log.error(' Failed to broadcast events:', broadcastError);
				// Don't fail the operation if broadcast fails
			}

			return intervention;
		} catch (error) {
			log.error(` Error creating intervention:`, error);
			throw error;
		}
	}

	/**
	 * Get a single intervention by ID
	 */
	async getIntervention(interventionId: string): Promise<Intervention | null> {
		try {
			log.info(` Fetching intervention ${interventionId}...`);

			// Get from repository (already includes all BaseEntity fields)
			const intervention = await this.interventionsRepository.findById(interventionId);

			return intervention;
		} catch (error) {
			log.error(` Error fetching intervention ${interventionId}:`, error);
			throw error;
		}
	}

	/**
	 * Respond to an intervention
	 * Synchronizes backend (file) and orchestrator (cache) state
	 */
	async respondToIntervention(
		interventionId: string,
		response: InterventionResponseSubmit
	): Promise<SuccessResponse> {
		try {
			log.info(` Responding to intervention ${interventionId}...`);

			// 1. Update backend file storage (source of truth)
			// Note: answeredBy should be set from authenticated user context (future enhancement)
			const updatedIntervention = await this.interventionsRepository.respond(interventionId, {
				value: response.value,
				answeredBy: 'web-user', // TODO: Get from authenticated user context
				comment: response.comment,
			});

			log.info(` Intervention ${interventionId} answered in backend storage`);

			// 2. Notify orchestrator to update its cache and unblock worker
			try {
				await this.orchestratorRepository.respondToIntervention(interventionId, {
					value: response.value,
					answeredBy: 'web-user',
					comment: response.comment,
				});
				log.info(` Orchestrator notified of intervention ${interventionId} response`);
			} catch (orchestratorError) {
				log.error(' Failed to notify orchestrator of intervention response:', orchestratorError);
				// Don't fail the operation if orchestrator notification fails
				// Backend file is already updated (source of truth)
			}

			// 3. Emit events for real-time UI updates
			try {
				// Broadcast the updated intervention
				await this.eventBroadcaster.broadcast(B2F_INTERVENTION_ANSWERED, updatedIntervention);
				// Broadcast updated list
				const allInterventions = await this.interventionsRepository.findAll();
				await this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, allInterventions);
			} catch (broadcastError) {
				log.error(' Failed to broadcast intervention answered event:', broadcastError);
			}

			return {
				success: true,
				message: 'Intervention answered successfully',
			};
		} catch (error) {
			log.error(` Error responding to intervention ${interventionId}:`, error);
			throw error;
		}
	}

	/**
	 * Cancel an intervention
	 */
	async cancelIntervention(interventionId: string): Promise<SuccessResponse> {
		try {
			log.info(` Cancelling intervention ${interventionId}...`);

			// Cancel via repository
			await this.interventionsRepository.cancel(interventionId);

			log.info(` Intervention ${interventionId} cancelled`);

			// Emit events
			try {
				// Broadcast updated list
				const allInterventions = await this.interventionsRepository.findAll();
				await this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, allInterventions);
			} catch (broadcastError) {
				log.error(' Failed to broadcast intervention cancelled event:', broadcastError);
			}

			return {
				success: true,
				message: 'Intervention cancelled successfully',
			};
		} catch (error) {
			log.error(` Error cancelling intervention ${interventionId}:`, error);
			throw error;
		}
	}

	/**
	 * Bulk cancel multiple interventions
	 */
	async bulkCancelInterventions(ids: string[]): Promise<BulkCancelResponse> {
		log.info(` Bulk cancelling ${ids.length} interventions...`);

		// Delegate to repository for bulk operation
		const result = await this.interventionsRepository.bulkCancel(ids);

		log.info(`Bulk cancel completed: ${result.cancelled.length} succeeded, ${result.failed.length} failed`);

		// Emit events for real-time updates
		try {
			// Broadcast updated list
			const allInterventions = await this.interventionsRepository.findAll();
			await this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, allInterventions);
		} catch (broadcastError) {
			log.error(' Failed to broadcast bulk cancel event:', broadcastError);
		}

		return result;
	}

	/**
	 * Emit intervention created event (called by orchestrator when intervention is created)
	 */
	async emitInterventionCreated(interventionId: string): Promise<void> {
		try {
			// Get actual intervention from repository
			const intervention = await this.interventionsRepository.findById(interventionId);
			if (intervention) {
				await this.eventBroadcaster.broadcast(B2F_INTERVENTION_CREATED, intervention);
			}
			// Broadcast updated list
			const allInterventions = await this.interventionsRepository.findAll();
			await this.eventBroadcaster.broadcast(B2F_INTERVENTIONS_UPDATED, allInterventions);
		} catch (error) {
			log.error(' Failed to broadcast intervention created event:', error);
		}
	}
}
