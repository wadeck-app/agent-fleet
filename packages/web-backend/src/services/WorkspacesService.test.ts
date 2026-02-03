import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@app/shared/api/projects.contract';
import type { Workspace } from '@app/shared/api/workspaces.contract';

import { BaseRepository } from '../repositories/BaseRepository';
import { ProjectsRepository } from '../repositories/ProjectsRepository';
import type { WorkspaceMetadataRepository } from '../repositories/WorkspaceMetadataRepository';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import { WorkspacesService } from './WorkspacesService';

/**
 * ===========================================================================================
 * WORKSPACES SERVICE TESTS
 * ===========================================================================================
 *
 * Tests for workspace metadata updates (name, description, color).
 * Project association is now managed via Projects API, not WorkspacesService.
 *
 * Test Coverage:
 * - Updating workspace metadata
 * - Finding workspace by ID (metadata ID or hash-based ID)
 * - Event emission on successful update
 * - Error handling for non-existent workspaces
 *
 * ===========================================================================================
 */

describe('WorkspacesService', () => {
	let storage: InMemoryStorage;
	let projectsRepository: ProjectsRepository;
	let workspacesService: WorkspacesService;

	// Mock dependencies
	let mockEventBroadcaster: EventBroadcaster;
	let mockOrchestratorWrapper: OrchestratorWrapper;
	let mockMetadataRepository: WorkspaceMetadataRepository;

	// Test data
	const testWorkspacePath = 'C:\\test\\workspace';
	const testWorkspaceId = '50115a2e-5226-46d4-9fb8-6f9c11a16f9d';

	beforeEach(async () => {
		// Setup storage and repositories
		storage = new InMemoryStorage();
		const baseRepository = new BaseRepository<Project>('projects', storage);
		projectsRepository = new ProjectsRepository(baseRepository);

		// Setup mock EventBroadcaster
		mockEventBroadcaster = {
			broadcast: vi.fn(),
		} as any;

		// Setup mock OrchestratorWrapper
		mockOrchestratorWrapper = {
			getConnectedWorkersWorkspaces: vi.fn().mockResolvedValue([
				{
					workerId: 'worker-1',
					workspacePath: testWorkspacePath,
					projectId: '',
					connectedAt: new Date().toISOString(),
					gitBranch: 'main',
				},
			]),
		} as any;

		// Setup mock WorkspaceMetadataRepository
		mockMetadataRepository = {
			getMetadataForWorkspaces: vi.fn().mockResolvedValue(
				new Map([
					[
						testWorkspacePath,
						{
							id: testWorkspaceId,
							name: 'Test Workspace',
							description: 'Test Description',
							color: '#FF0000',
							mode: 'development',
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
						},
					],
				])
			),
			upsertMetadata: vi.fn().mockImplementation(async (_path, data) => {
				// Return updated metadata with merged data
				return {
					id: testWorkspaceId,
					name: data.name || 'Test Workspace',
					description: data.description || 'Test Description',
					color: data.color || '#FF0000',
					mode: data.mode || 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};
			}),
			startWatching: vi.fn(),
			setChangeCallback: vi.fn(),
		} as any;

		// Create WorkspacesService
		workspacesService = new WorkspacesService(
			mockEventBroadcaster,
			mockOrchestratorWrapper,
			mockMetadataRepository,
			projectsRepository
		);
	});

	afterEach(async () => {
		await storage.clear();
		vi.clearAllMocks();
	});

	describe('updateWorkspace', () => {
		it('should update workspace name', async () => {
			// Act
			const updatedWorkspace = await workspacesService.updateWorkspace(testWorkspaceId, {
				name: 'Updated Name',
			});

			// Assert
			expect(updatedWorkspace.name).toBe('Updated Name');
			expect(mockMetadataRepository.upsertMetadata).toHaveBeenCalledWith(testWorkspacePath, {
				name: 'Updated Name',
				description: undefined,
				color: undefined,
			});
		});

		it('should update workspace description', async () => {
			// Act
			const updatedWorkspace = await workspacesService.updateWorkspace(testWorkspaceId, {
				description: 'New Description',
			});

			// Assert
			expect(updatedWorkspace.description).toBe('New Description');
			expect(mockMetadataRepository.upsertMetadata).toHaveBeenCalledWith(testWorkspacePath, {
				name: undefined,
				description: 'New Description',
				color: undefined,
			});
		});

		it('should update workspace color', async () => {
			// Act
			const updatedWorkspace = await workspacesService.updateWorkspace(testWorkspaceId, {
				color: '#00FF00',
			});

			// Assert
			expect(updatedWorkspace.color).toBe('#00FF00');
			expect(mockMetadataRepository.upsertMetadata).toHaveBeenCalledWith(testWorkspacePath, {
				name: undefined,
				description: undefined,
				color: '#00FF00',
			});
		});

		it('should update multiple fields at once', async () => {
			// Act
			const updatedWorkspace = await workspacesService.updateWorkspace(testWorkspaceId, {
				name: 'Multi Update',
				description: 'Multi Description',
				color: '#0000FF',
			});

			// Assert
			expect(updatedWorkspace.name).toBe('Multi Update');
			expect(updatedWorkspace.description).toBe('Multi Description');
			expect(updatedWorkspace.color).toBe('#0000FF');
		});

		it('should emit B2F_WORKSPACE_UPDATED event after successful update', async () => {
			// Act
			await workspacesService.updateWorkspace(testWorkspaceId, {
				name: 'Event Test',
			});

			// Assert
			const broadcastCalls = (mockEventBroadcaster.broadcast as any).mock.calls;
			const workspaceUpdateEvents = broadcastCalls.filter((call: any) => call[0] === 'b2f:workspace:updated');

			expect(workspaceUpdateEvents).toHaveLength(1);
			expect(workspaceUpdateEvents[0][1]).toMatchObject({
				id: testWorkspaceId,
				name: 'Event Test',
			});
		});

		it('should start watching the metadata file', async () => {
			// Act
			await workspacesService.updateWorkspace(testWorkspaceId, {
				name: 'Watch Test',
			});

			// Assert
			expect(mockMetadataRepository.startWatching).toHaveBeenCalledWith(testWorkspacePath);
		});

		it('should throw error for non-existent workspace', async () => {
			// Setup: empty workspaces
			mockOrchestratorWrapper.getConnectedWorkersWorkspaces = vi.fn().mockResolvedValue([]);

			// Act & Assert
			await expect(workspacesService.updateWorkspace('non-existent-id', { name: 'Test' })).rejects.toThrow(
				'Workspace non-existent-id not found'
			);
		});

		it('should find workspace by hash-based ID if not found by metadata ID', async () => {
			// Setup: workspace not in metadata map
			mockMetadataRepository.getMetadataForWorkspaces = vi.fn().mockResolvedValue(new Map());

			// The service should generate ID from path and match it
			// This requires WorkspaceMapper.generateIdFromPath to be tested separately

			// For now, this test documents the expected behavior
			// In practice, hash-based ID lookup happens via WorkspaceMapper
		});
	});

	describe('getWorkspacesData', () => {
		it('should return workspaces with metadata', async () => {
			// Act
			const data = await workspacesService.getWorkspacesData();

			// Assert
			expect(data.workspaces).toHaveLength(1);
			expect(data.workspaces[0]).toMatchObject({
				id: testWorkspaceId,
				name: 'Test Workspace',
				description: 'Test Description',
			});
		});

		it('should calculate summary statistics', async () => {
			// Act
			const data = await workspacesService.getWorkspacesData();

			// Assert
			expect(data.summary).toMatchObject({
				total: 1,
				active: 1,
				locked: 0,
				cleaning: 0,
				errorCount: 0,
			});
		});

		it('should return empty data on error', async () => {
			// Setup: orchestrator throws error
			mockOrchestratorWrapper.getConnectedWorkersWorkspaces = vi
				.fn()
				.mockRejectedValue(new Error('Connection failed'));

			// Act
			const data = await workspacesService.getWorkspacesData();

			// Assert
			expect(data.workspaces).toHaveLength(0);
			expect(data.summary.total).toBe(0);
		});
	});

	describe('getWorkspacesList', () => {
		it('should return paginated workspaces', async () => {
			// Act
			const list = await workspacesService.getWorkspacesList({ page: 1, pageSize: 10 });

			// Assert
			expect(list.items).toHaveLength(1);
			expect(list.pagination).toMatchObject({
				total: 1,
				page: 1,
				pageSize: 10,
				totalPages: 1,
			});
		});

		it('should apply search filter', async () => {
			// Act
			const list = await workspacesService.getWorkspacesList({ search: 'Test' });

			// Assert
			expect(list.items).toHaveLength(1);
			expect(list.items[0].name).toBe('Test Workspace');
		});

		it('should filter by status', async () => {
			// Act
			const list = await workspacesService.getWorkspacesList({ status: 'active' });

			// Assert
			expect(list.items).toHaveLength(1);
		});

		it('should start watching metadata files', async () => {
			// Act
			await workspacesService.getWorkspacesList({});

			// Assert
			expect(mockMetadataRepository.startWatching).toHaveBeenCalledWith(testWorkspacePath);
		});
	});

	describe('workspace enrichment (activeWorkerId and projectId)', () => {
		it('should include activeWorkerId in workspace data', async () => {
			// Act
			const data = await workspacesService.getWorkspacesData();

			// Assert
			expect(data.workspaces).toHaveLength(1);
			expect(data.workspaces[0].activeWorkerId).toBe('worker-1');
		});

		it('should include projectId when workspace is associated with a project', async () => {
			// Setup: Create a project with this workspace
			const project = await projectsRepository.create({
				name: 'Test Project',
				description: 'Test Description',
				archived: false,
				taskCount: 0,
				pinned: false,
				order: 0,
				workspaceIds: [testWorkspaceId],
			});

			// Act
			const data = await workspacesService.getWorkspacesData();

			// Assert
			expect(data.workspaces).toHaveLength(1);
			expect(data.workspaces[0].projectId).toBe(project.id);
		});

		it('should not include projectId when workspace is not associated with any project', async () => {
			// Act
			const data = await workspacesService.getWorkspacesData();

			// Assert
			expect(data.workspaces).toHaveLength(1);
			expect(data.workspaces[0].projectId).toBeUndefined();
		});

		it('should include enrichment data in getWorkspacesList', async () => {
			// Setup: Create a project with this workspace
			const project = await projectsRepository.create({
				name: 'Test Project',
				description: 'Test Description',
				archived: false,
				taskCount: 0,
				pinned: false,
				order: 0,
				workspaceIds: [testWorkspaceId],
			});

			// Act
			const list = await workspacesService.getWorkspacesList({ page: 1, pageSize: 10 });

			// Assert
			expect(list.items).toHaveLength(1);
			expect(list.items[0].activeWorkerId).toBe('worker-1');
			expect(list.items[0].projectId).toBe(project.id);
		});

		it('should include enrichment data in updateWorkspace', async () => {
			// Setup: Create a project with this workspace
			const project = await projectsRepository.create({
				name: 'Test Project',
				description: 'Test Description',
				archived: false,
				taskCount: 0,
				pinned: false,
				order: 0,
				workspaceIds: [testWorkspaceId],
			});

			// Act
			const updatedWorkspace = await workspacesService.updateWorkspace(testWorkspaceId, {
				name: 'Updated Name',
			});

			// Assert
			expect(updatedWorkspace.activeWorkerId).toBe('worker-1');
			expect(updatedWorkspace.projectId).toBe(project.id);
		});
	});
});
