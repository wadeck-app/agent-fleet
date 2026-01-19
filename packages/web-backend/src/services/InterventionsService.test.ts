import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import { InterventionsService } from './InterventionsService';

/**
 * ===========================================================================================
 * INTERVENTIONS SERVICE TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Mock the InterventionsRepository and EventBroadcaster (unit test - no real dependencies)
 * - Test business logic: filtering, sorting, pagination, search
 * - Test response submission, cancellation, and bulk operations
 * - Test event broadcasting after successful operations
 * - Cover all edge cases
 *
 * ===========================================================================================
 */

describe('InterventionsService', () => {
	let service: InterventionsService;
	let mockRepository: InterventionsRepository;
	let mockEventBroadcaster: EventBroadcaster;
	let mockOrchestratorRepository: any;

	// Sample test data
	const sampleIntervention: Intervention = {
		id: '1',
		taskId: 'task-1',
		workerId: 'worker-1',
		flowId: 'flow-1',
		stepId: 'step-1',
		type: 'approval',
		status: 'pending',
		blocking: true,
		source: {
			type: 'flow_step',
			stepId: 'step-1',
		},
		config: {
			title: 'Approve deployment',
			description: 'Please review and approve the deployment to production',
		},
		version: 1,
		createdAt: '2024-01-01T10:00:00.000Z',
		updatedAt: '2024-01-01T10:00:00.000Z',
	};

	const answeredIntervention: Intervention = {
		id: '2',
		taskId: 'task-2',
		workerId: 'worker-1',
		type: 'question',
		status: 'answered',
		blocking: false,
		answeredAt: '2024-01-01T11:00:00.000Z',
		source: {
			type: 'agent_tool',
			toolName: 'user-input',
		},
		config: {
			title: 'Enter configuration',
			question: 'What is the database name?',
			responseType: 'text',
		},
		response: {
			value: 'production_db',
			answeredBy: 'web-user',
		},
		version: 1,
		createdAt: '2024-01-01T10:30:00.000Z',
		updatedAt: '2024-01-01T11:00:00.000Z',
	};

	const cancelledIntervention: Intervention = {
		id: '3',
		taskId: 'task-1',
		type: 'choice',
		status: 'cancelled',
		blocking: true,
		source: {
			type: 'flow_step',
			stepId: 'step-2',
		},
		config: {
			title: 'Choose environment',
			options: [
				{ id: 'dev', label: 'Development' },
				{ id: 'prod', label: 'Production' },
			],
		},
		version: 2,
		createdAt: '2024-01-01T09:00:00.000Z',
		updatedAt: '2024-01-01T12:00:00.000Z',
	};

	beforeEach(() => {
		// Create mock repository
		mockRepository = {
			findAll: vi.fn(),
			findById: vi.fn(),
			findByTask: vi.fn(),
			findPending: vi.fn(),
			findByStatus: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			respond: vi.fn(),
			cancel: vi.fn(),
			timeout: vi.fn(),
			bulkCancel: vi.fn(),
		} as unknown as InterventionsRepository;

		// Create mock event broadcaster
		mockEventBroadcaster = {
			broadcast: vi.fn(),
		} as unknown as EventBroadcaster;

		// Create mock orchestrator repository
		mockOrchestratorRepository = {
			respondToIntervention: vi.fn(),
		};

		// Create service with mocks
		service = new InterventionsService(mockRepository, mockEventBroadcaster, mockOrchestratorRepository);
	});

	describe('getInterventions - List interventions with filtering, sorting, and pagination', () => {
		it('should list all interventions with default pagination', async () => {
			const interventions = [sampleIntervention, answeredIntervention, cancelledIntervention];
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			const result = await service.getInterventions({});

			expect(result.items).toHaveLength(3);
			expect(result.items).toEqual(interventions);
			expect(result.pagination).toEqual({
				total: 3,
				page: 1,
				pageSize: 10,
				totalPages: 1,
			});
			expect(mockRepository.findAll).toHaveBeenCalledWith({});
		});

		it('should apply status filter via repository', async () => {
			const query: InterventionsQuery = { status: 'pending' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleIntervention]);

			const result = await service.getInterventions(query);

			expect(result.items).toHaveLength(1);
			expect(result.items[0].status).toBe('pending');
			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should apply type filter via repository', async () => {
			const query: InterventionsQuery = { type: 'approval' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleIntervention]);

			const result = await service.getInterventions(query);

			expect(result.items).toHaveLength(1);
			expect(result.items[0].type).toBe('approval');
			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should apply blocking filter via repository', async () => {
			const query: InterventionsQuery = { blocking: true };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleIntervention, cancelledIntervention]);

			const result = await service.getInterventions(query);

			expect(result.items).toHaveLength(2);
			expect(result.items.every(i => i.blocking)).toBe(true);
			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should apply taskId filter via repository', async () => {
			const query: InterventionsQuery = { taskId: 'task-1' };
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleIntervention, cancelledIntervention]);

			const result = await service.getInterventions(query);

			expect(result.items).toHaveLength(2);
			expect(result.items.every(i => i.taskId === 'task-1')).toBe(true);
			expect(mockRepository.findAll).toHaveBeenCalledWith(query);
		});

		it('should apply search filter across multiple fields', async () => {
			const interventions = [sampleIntervention, answeredIntervention, cancelledIntervention];
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			// Search by title
			const query: InterventionsQuery = { search: 'deployment' };
			const result = await service.getInterventions(query);

			expect(result.items).toHaveLength(1);
			expect(result.items[0].config.title).toContain('deployment');
		});

		it('should search by intervention ID', async () => {
			const interventions = [sampleIntervention, answeredIntervention, cancelledIntervention];
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			const query: InterventionsQuery = { search: '2' };
			const result = await service.getInterventions(query);

			expect(result.items).toHaveLength(1);
			expect(result.items[0].id).toBe('2');
		});

		it('should search case-insensitively', async () => {
			const interventions = [sampleIntervention, answeredIntervention];
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			const query: InterventionsQuery = { search: 'APPROVE' };
			const result = await service.getInterventions(query);

			expect(result.items).toHaveLength(1);
			expect(result.items[0].config.title.toLowerCase()).toContain('approve');
		});

		it('should sort by createdAt descending by default', async () => {
			const interventions = [sampleIntervention, answeredIntervention, cancelledIntervention];
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			const result = await service.getInterventions({});

			// Most recent first (task-2 at 10:30, task-1 at 10:00, task-1 at 09:00)
			expect(result.items[0].id).toBe('2');
			expect(result.items[1].id).toBe('1');
			expect(result.items[2].id).toBe('3');
		});

		it('should sort by createdAt ascending when specified', async () => {
			const interventions = [sampleIntervention, answeredIntervention, cancelledIntervention];
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			const query: InterventionsQuery = { sortBy: 'createdAt', sortOrder: 'asc' };
			const result = await service.getInterventions(query);

			// Oldest first
			expect(result.items[0].id).toBe('3');
			expect(result.items[1].id).toBe('1');
			expect(result.items[2].id).toBe('2');
		});

		it('should sort by blocking status', async () => {
			const interventions = [answeredIntervention, sampleIntervention, cancelledIntervention];
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			const query: InterventionsQuery = { sortBy: 'blocking', sortOrder: 'desc' };
			const result = await service.getInterventions(query);

			// Blocking interventions first
			expect(result.items[0].blocking).toBe(true);
			expect(result.items[1].blocking).toBe(true);
			expect(result.items[2].blocking).toBe(false);
		});

		it('should paginate results correctly - page 1', async () => {
			const interventions = Array.from({ length: 15 }, (_, i) => ({
				...sampleIntervention,
				id: String(i + 1),
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			const result = await service.getInterventions({ page: 1, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('1');
			expect(result.items[4].id).toBe('5');
			expect(result.pagination).toEqual({
				total: 15,
				page: 1,
				pageSize: 5,
				totalPages: 3,
			});
		});

		it('should paginate results correctly - page 2', async () => {
			const interventions = Array.from({ length: 15 }, (_, i) => ({
				...sampleIntervention,
				id: String(i + 1),
			}));
			vi.mocked(mockRepository.findAll).mockResolvedValue(interventions);

			const result = await service.getInterventions({ page: 2, pageSize: 5 });

			expect(result.items).toHaveLength(5);
			expect(result.items[0].id).toBe('6');
			expect(result.items[4].id).toBe('10');
		});

		it('should handle empty results', async () => {
			vi.mocked(mockRepository.findAll).mockResolvedValue([]);

			const result = await service.getInterventions({});

			expect(result.items).toHaveLength(0);
			expect(result.pagination).toEqual({
				total: 0,
				page: 1,
				pageSize: 10,
				totalPages: 0,
			});
		});

		it('should handle errors from repository', async () => {
			vi.mocked(mockRepository.findAll).mockRejectedValue(new Error('Database error'));

			await expect(service.getInterventions({})).rejects.toThrow('Database error');
		});
	});

	describe('getIntervention - Get single intervention by ID', () => {
		it('should return intervention when found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIntervention);

			const result = await service.getIntervention('1');

			expect(result).toEqual(sampleIntervention);
			expect(mockRepository.findById).toHaveBeenCalledWith('1');
		});

		it('should return null when intervention not found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);

			const result = await service.getIntervention('999');

			expect(result).toBeNull();
			expect(mockRepository.findById).toHaveBeenCalledWith('999');
		});

		it('should handle errors from repository', async () => {
			vi.mocked(mockRepository.findById).mockRejectedValue(new Error('Database error'));

			await expect(service.getIntervention('1')).rejects.toThrow('Database error');
		});
	});

	describe('respondToIntervention - Submit response to intervention', () => {
		const responseData: InterventionResponseSubmit = {
			value: true,
			comment: 'Approved for production deployment',
		};

		const updatedIntervention: Intervention = {
			...sampleIntervention,
			status: 'answered',
			answeredAt: '2024-01-01T12:00:00.000Z',
			response: {
				value: true,
				answeredBy: 'web-user',
				comment: 'Approved for production deployment',
			},
			version: 2,
			updatedAt: '2024-01-01T12:00:00.000Z',
		};

		it('should submit response successfully', async () => {
			vi.mocked(mockRepository.respond).mockResolvedValue(updatedIntervention);
			vi.mocked(mockRepository.findAll).mockResolvedValue([updatedIntervention]);

			const result = await service.respondToIntervention('1', responseData);

			expect(result).toEqual({
				success: true,
				message: 'Intervention answered successfully',
			});
			expect(mockRepository.respond).toHaveBeenCalledWith('1', {
				value: true,
				answeredBy: 'web-user',
				comment: 'Approved for production deployment',
			});
		});

		it('should broadcast events after successful response', async () => {
			vi.mocked(mockRepository.respond).mockResolvedValue(updatedIntervention);
			vi.mocked(mockRepository.findAll).mockResolvedValue([updatedIntervention]);

			await service.respondToIntervention('1', responseData);

			expect(mockEventBroadcaster.broadcast).toHaveBeenCalledWith(B2F_INTERVENTION_ANSWERED, updatedIntervention);
			expect(mockEventBroadcaster.broadcast).toHaveBeenCalledWith(B2F_INTERVENTIONS_UPDATED, [
				updatedIntervention,
			]);
		});

		it('should handle response without comment', async () => {
			const simpleResponse: InterventionResponseSubmit = {
				value: 'production_db',
			};

			vi.mocked(mockRepository.respond).mockResolvedValue(updatedIntervention);
			vi.mocked(mockRepository.findAll).mockResolvedValue([updatedIntervention]);

			await service.respondToIntervention('1', simpleResponse);

			expect(mockRepository.respond).toHaveBeenCalledWith('1', {
				value: 'production_db',
				answeredBy: 'web-user',
				comment: undefined,
			});
		});

		it('should not fail operation if broadcast fails', async () => {
			vi.mocked(mockRepository.respond).mockResolvedValue(updatedIntervention);
			vi.mocked(mockEventBroadcaster.broadcast).mockRejectedValue(new Error('Broadcast failed'));

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = await service.respondToIntervention('1', responseData);

			expect(result.success).toBe(true);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to broadcast intervention answered event'),
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});

		it('should throw error if repository operation fails', async () => {
			vi.mocked(mockRepository.respond).mockRejectedValue(new Error('Intervention not found or not pending'));

			await expect(service.respondToIntervention('1', responseData)).rejects.toThrow(
				'Intervention not found or not pending'
			);
		});
	});

	describe('cancelIntervention - Cancel an intervention', () => {
		const cancelledResult: Intervention = {
			...sampleIntervention,
			status: 'cancelled',
			version: 2,
			updatedAt: '2024-01-01T12:00:00.000Z',
		};

		it('should cancel intervention successfully', async () => {
			vi.mocked(mockRepository.cancel).mockResolvedValue(cancelledResult);
			vi.mocked(mockRepository.findAll).mockResolvedValue([cancelledResult]);

			const result = await service.cancelIntervention('1');

			expect(result).toEqual({
				success: true,
				message: 'Intervention cancelled successfully',
			});
			expect(mockRepository.cancel).toHaveBeenCalledWith('1');
		});

		it('should broadcast events after successful cancellation', async () => {
			vi.mocked(mockRepository.cancel).mockResolvedValue(cancelledResult);
			vi.mocked(mockRepository.findAll).mockResolvedValue([cancelledResult]);

			await service.cancelIntervention('1');

			expect(mockEventBroadcaster.broadcast).toHaveBeenCalledWith(B2F_INTERVENTIONS_UPDATED, [cancelledResult]);
		});

		it('should not fail operation if broadcast fails', async () => {
			vi.mocked(mockRepository.cancel).mockResolvedValue(cancelledResult);
			vi.mocked(mockEventBroadcaster.broadcast).mockRejectedValue(new Error('Broadcast failed'));

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = await service.cancelIntervention('1');

			expect(result.success).toBe(true);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to broadcast intervention cancelled event'),
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});

		it('should throw error if repository operation fails', async () => {
			vi.mocked(mockRepository.cancel).mockRejectedValue(new Error('Intervention not found or not pending'));

			await expect(service.cancelIntervention('1')).rejects.toThrow('Intervention not found or not pending');
		});
	});

	describe('bulkCancelInterventions - Cancel multiple interventions', () => {
		it('should cancel all interventions successfully', async () => {
			const bulkResult: BulkCancelResponse = {
				cancelled: ['1', '2', '3'],
				failed: [],
			};

			vi.mocked(mockRepository.bulkCancel).mockResolvedValue(bulkResult);
			vi.mocked(mockRepository.findAll).mockResolvedValue([]);

			const result = await service.bulkCancelInterventions(['1', '2', '3']);

			expect(result).toEqual(bulkResult);
			expect(mockRepository.bulkCancel).toHaveBeenCalledWith(['1', '2', '3']);
		});

		it('should handle partial failures', async () => {
			const bulkResult: BulkCancelResponse = {
				cancelled: ['1', '2'],
				failed: [
					{
						id: '3',
						error: 'Intervention not found or not pending',
					},
				],
			};

			vi.mocked(mockRepository.bulkCancel).mockResolvedValue(bulkResult);
			vi.mocked(mockRepository.findAll).mockResolvedValue([]);

			const result = await service.bulkCancelInterventions(['1', '2', '3']);

			expect(result.cancelled).toHaveLength(2);
			expect(result.failed).toHaveLength(1);
			expect(result.failed[0].id).toBe('3');
		});

		it('should broadcast events after bulk cancellation', async () => {
			const bulkResult: BulkCancelResponse = {
				cancelled: ['1', '2'],
				failed: [],
			};

			vi.mocked(mockRepository.bulkCancel).mockResolvedValue(bulkResult);
			vi.mocked(mockRepository.findAll).mockResolvedValue([]);

			await service.bulkCancelInterventions(['1', '2']);

			expect(mockEventBroadcaster.broadcast).toHaveBeenCalledWith(B2F_INTERVENTIONS_UPDATED, []);
		});

		it('should not fail operation if broadcast fails', async () => {
			const bulkResult: BulkCancelResponse = {
				cancelled: ['1'],
				failed: [],
			};

			vi.mocked(mockRepository.bulkCancel).mockResolvedValue(bulkResult);
			vi.mocked(mockEventBroadcaster.broadcast).mockRejectedValue(new Error('Broadcast failed'));

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = await service.bulkCancelInterventions(['1']);

			expect(result.cancelled).toHaveLength(1);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to broadcast bulk cancel event'),
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});
	});

	describe('emitInterventionCreated - Emit intervention created event', () => {
		it('should broadcast intervention created and updated list', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIntervention);
			vi.mocked(mockRepository.findAll).mockResolvedValue([sampleIntervention]);

			await service.emitInterventionCreated('1');

			expect(mockRepository.findById).toHaveBeenCalledWith('1');
			expect(mockEventBroadcaster.broadcast).toHaveBeenCalledWith(B2F_INTERVENTION_CREATED, sampleIntervention);
			expect(mockEventBroadcaster.broadcast).toHaveBeenCalledWith(B2F_INTERVENTIONS_UPDATED, [
				sampleIntervention,
			]);
		});

		it('should not broadcast if intervention not found', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(null);
			vi.mocked(mockRepository.findAll).mockResolvedValue([]);

			await service.emitInterventionCreated('999');

			expect(mockEventBroadcaster.broadcast).toHaveBeenCalledTimes(1);
			expect(mockEventBroadcaster.broadcast).toHaveBeenCalledWith(B2F_INTERVENTIONS_UPDATED, []);
		});

		it('should not throw error if broadcast fails', async () => {
			vi.mocked(mockRepository.findById).mockResolvedValue(sampleIntervention);
			vi.mocked(mockEventBroadcaster.broadcast).mockRejectedValue(new Error('Broadcast failed'));

			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			await service.emitInterventionCreated('1');

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to broadcast intervention created event'),
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});
	});
});
