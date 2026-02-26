import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@app/shared/api/projects.contract';
import type { WorkspaceMetadataEntity } from '@app/shared/api/workspaces.contract';

import { BaseRepository } from '../repositories/BaseRepository';
import { ProjectsRepository } from '../repositories/ProjectsRepository';
import { WorkspaceMetadataRepository } from '../repositories/WorkspaceMetadataRepository';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import { WorkspacesService } from './WorkspacesService';

/**
 * ===========================================================================================
 * WORKSPACES SERVICE TESTS (centralized metadata repository)
 * ===========================================================================================
 */

describe('WorkspacesService', () => {
	let storage: InMemoryStorage;
	let metadataRepo: WorkspaceMetadataRepository;
	let projectsRepository: ProjectsRepository;
	let workspacesService: WorkspacesService;

	let mockEventBroadcaster: EventBroadcaster;
	let mockOrchestratorWrapper: OrchestratorWrapper;

	const testWorkspacePath = 'C:\\test\\workspace';

	beforeEach(async () => {
		storage = new InMemoryStorage();

		// Create centralized WorkspaceMetadataRepository
		const workspacesBase = new BaseRepository<WorkspaceMetadataEntity>('workspaces', storage);
		metadataRepo = new WorkspaceMetadataRepository(workspacesBase);

		// Create ProjectsRepository
		const projectsBase = new BaseRepository<Project>('projects', storage);
		projectsRepository = new ProjectsRepository(projectsBase);

		mockEventBroadcaster = {
			broadcast: vi.fn(),
		} as any;

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

		workspacesService = new WorkspacesService(
			mockEventBroadcaster,
			mockOrchestratorWrapper,
			metadataRepo,
			projectsRepository
		);
	});

	afterEach(async () => {
		await storage.clear();
		vi.clearAllMocks();
	});

	describe('getWorkspacesData', () => {
		it('should auto-register unknown worker paths and return workspaces', async () => {
			const data = await workspacesService.getWorkspacesData();

			expect(data.workspaces).toHaveLength(1);
			expect(data.workspaces[0].path).toBe(testWorkspacePath);
			// Worker connected → active
			expect(data.workspaces[0].status).toBe('active');
			expect(data.workspaces[0].activeWorkerId).toBe('worker-1');
		});

		it('should expose gitBranch from worker info when worker is connected', async () => {
			await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test',
				mode: 'development',
			});

			const data = await workspacesService.getWorkspacesData();

			const ws = data.workspaces.find(w => w.path === testWorkspacePath);
			expect(ws?.gitBranch).toBe('main');
		});

		it('should use stored entity gitBranch as fallback when no worker is connected', async () => {
			await metadataRepo.create({
				path: 'C:\\idle\\workspace',
				name: 'Idle',
				mode: 'development',
				gitBranch: 'develop',
			});

			// Worker only connected to testWorkspacePath, not to idle workspace
			const data = await workspacesService.getWorkspacesData();

			const idleWs = data.workspaces.find(w => w.path === 'C:\\idle\\workspace');
			expect(idleWs?.gitBranch).toBe('develop');
		});

		it('should prefer worker gitBranch over stored entity gitBranch', async () => {
			await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test',
				mode: 'development',
				gitBranch: 'old-branch',
			});

			const data = await workspacesService.getWorkspacesData();

			// Worker reports 'main', entity has 'old-branch' → worker wins
			const ws = data.workspaces.find(w => w.path === testWorkspacePath);
			expect(ws?.gitBranch).toBe('main');
		});

		it('should show idle status for workspaces without connected worker', async () => {
			// Pre-create a workspace entity
			await metadataRepo.create({
				path: 'C:\\idle\\workspace',
				name: 'Idle Workspace',
				mode: 'development',
			});

			// Orchestrator returns no workers for this path
			const data = await workspacesService.getWorkspacesData();

			// Should show both workspaces
			expect(data.workspaces.length).toBeGreaterThanOrEqual(2);
			const idleWorkspace = data.workspaces.find(w => w.path === 'C:\\idle\\workspace');
			expect(idleWorkspace).toBeDefined();
			expect(idleWorkspace!.status).toBe('idle');
			expect(idleWorkspace!.activeWorkerId).toBeUndefined();
		});

		it('should calculate summary statistics including idle', async () => {
			await metadataRepo.create({
				path: 'C:\\idle\\workspace',
				name: 'Idle',
				mode: 'development',
			});

			const data = await workspacesService.getWorkspacesData();

			expect(data.summary.active).toBe(1);
			expect(data.summary.idle).toBe(1);
			expect(data.summary.total).toBe(2);
		});

		it('should return empty data on error', async () => {
			mockOrchestratorWrapper.getConnectedWorkersWorkspaces = vi
				.fn()
				.mockRejectedValue(new Error('Connection failed'));

			const data = await workspacesService.getWorkspacesData();

			expect(data.workspaces).toHaveLength(0);
			expect(data.summary.total).toBe(0);
		});

		it('should return workspaces with metadata from centralized store', async () => {
			// Pre-register workspace with metadata
			await metadataRepo.create({
				path: testWorkspacePath,
				name: 'My Workspace',
				description: 'Test Description',
				color: '#FF0000',
				mode: 'development',
			});

			const data = await workspacesService.getWorkspacesData();

			const ws = data.workspaces.find(w => w.path === testWorkspacePath);
			expect(ws).toBeDefined();
			expect(ws!.name).toBe('My Workspace');
			expect(ws!.description).toBe('Test Description');
			expect(ws!.color).toBe('#FF0000');
		});
	});

	describe('getWorkspacesList', () => {
		it('should return paginated workspaces', async () => {
			const list = await workspacesService.getWorkspacesList({ page: 1, pageSize: 10 });

			expect(list.items.length).toBeGreaterThanOrEqual(1);
			expect(list.pagination).toMatchObject({
				page: 1,
				pageSize: 10,
			});
		});

		it('should apply search filter', async () => {
			await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test Workspace',
				mode: 'development',
			});

			const list = await workspacesService.getWorkspacesList({ search: 'Test' });

			expect(list.items.length).toBeGreaterThanOrEqual(1);
			expect(list.items[0].name).toBe('Test Workspace');
		});

		it('should filter by status', async () => {
			// Create idle workspace
			await metadataRepo.create({
				path: 'C:\\idle\\ws',
				name: 'Idle',
				mode: 'development',
			});

			const activeList = await workspacesService.getWorkspacesList({ status: 'active' });
			const idleList = await workspacesService.getWorkspacesList({ status: 'idle' });

			expect(activeList.items.every(w => w.status === 'active')).toBe(true);
			expect(idleList.items.every(w => w.status === 'idle')).toBe(true);
		});
	});

	describe('updateWorkspace', () => {
		it('should update workspace name', async () => {
			const entity = await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Original',
				mode: 'development',
			});

			const updated = await workspacesService.updateWorkspace(entity.id, {
				name: 'Updated Name',
			});

			expect(updated.name).toBe('Updated Name');
		});

		it('should update workspace color', async () => {
			const entity = await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test',
				mode: 'development',
			});

			const updated = await workspacesService.updateWorkspace(entity.id, {
				color: '#00FF00',
			});

			expect(updated.color).toBe('#00FF00');
		});

		it('should emit B2F_WORKSPACE_UPDATED event', async () => {
			const entity = await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test',
				mode: 'development',
			});

			await workspacesService.updateWorkspace(entity.id, { name: 'Event Test' });

			const broadcastCalls = (mockEventBroadcaster.broadcast as any).mock.calls;
			const workspaceUpdateEvents = broadcastCalls.filter((call: any) => call[0] === 'b2f:workspace:updated');

			expect(workspaceUpdateEvents).toHaveLength(1);
			expect(workspaceUpdateEvents[0][1]).toMatchObject({
				name: 'Event Test',
			});
		});

		it('should throw error for non-existent workspace', async () => {
			await expect(workspacesService.updateWorkspace('non-existent-id', { name: 'Test' })).rejects.toThrow(
				'Workspace non-existent-id not found'
			);
		});

		it('should enrich with worker info when worker is connected', async () => {
			const entity = await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test',
				mode: 'development',
			});

			const updated = await workspacesService.updateWorkspace(entity.id, { name: 'Updated' });

			expect(updated.activeWorkerId).toBe('worker-1');
			expect(updated.status).toBe('active');
		});
	});

	describe('resolveWorkspacePath', () => {
		it('should resolve workspace ID to path', async () => {
			const entity = await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test',
				mode: 'development',
			});

			const path = await workspacesService.resolveWorkspacePath(entity.id);
			expect(path).toBe(testWorkspacePath);
		});

		it('should throw for unknown workspace ID', async () => {
			await expect(workspacesService.resolveWorkspacePath('unknown-id')).rejects.toThrow(
				'Source workspace not found: unknown-id'
			);
		});
	});

	describe('workspace enrichment (projectId)', () => {
		it('should include projectId when workspace is associated with a project', async () => {
			const entity = await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test',
				mode: 'development',
			});

			await projectsRepository.create({
				name: 'Test Project',
				description: 'Test',
				archived: false,
				taskCount: 0,
				pinned: false,
				order: 0,
				workspaceIds: [entity.id],
			});

			const data = await workspacesService.getWorkspacesData();
			const ws = data.workspaces.find(w => w.id === entity.id);
			expect(ws).toBeDefined();
			expect(ws!.projectId).toBeDefined();
		});

		it('should not include projectId when workspace is not associated with any project', async () => {
			await metadataRepo.create({
				path: testWorkspacePath,
				name: 'Test',
				mode: 'development',
			});

			const data = await workspacesService.getWorkspacesData();
			const ws = data.workspaces.find(w => w.path === testWorkspacePath);
			expect(ws!.projectId).toBeUndefined();
		});
	});
});
