import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@app/shared/api/projects.contract';

import { BaseRepository } from '../repositories/BaseRepository';
import { ProjectsRepository } from '../repositories/ProjectsRepository';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { ProjectsService } from './ProjectsService';

describe('ProjectsService - Normalization', () => {
	let storage: InMemoryStorage;
	let repository: ProjectsRepository;
	let service: ProjectsService;

	// Mock dependencies
	const mockOrchestratorRepository: any = {
		getTasks: vi.fn().mockResolvedValue([]),
	};

	const mockEventBroadcaster: any = {
		broadcast: vi.fn(),
	};

	const mockWorkspaceMetadataRepository: any = {
		getMetadataForWorkspaces: vi.fn().mockResolvedValue(new Map()),
	};

	const mockOrchestratorWrapper: any = {
		getConnectedWorkersWorkspaces: vi.fn().mockResolvedValue([]),
	};

	beforeEach(async () => {
		storage = new InMemoryStorage();
		const baseRepository = new BaseRepository<Project>('projects', storage);
		repository = new ProjectsRepository(baseRepository);

		service = new ProjectsService(
			repository,
			mockOrchestratorRepository,
			mockEventBroadcaster,
			mockWorkspaceMetadataRepository,
			mockOrchestratorWrapper
		);
	});

	afterEach(async () => {
		await storage.clear();
		vi.clearAllMocks();
	});

	it('should normalize project with undefined workspaceIds on getById', async () => {
		// Create a legacy project with undefined workspaceIds
		const legacyProject = {
			id: 'project-1',
			name: 'Legacy Project',
			description: 'Has undefined workspaceIds',
			workspaceIds: undefined as any,
			taskCount: 5,
			archived: false,
			pinned: true,
			order: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [legacyProject]);

		// Get project via service
		const project = await service.getById('project-1');

		// Should normalize workspaceIds to []
		expect(project.workspaceIds).toEqual([]);
		expect(project.taskCount).toBe(5);
		expect(project.archived).toBe(false);
		expect(project.pinned).toBe(true);
	});

	it('should normalize project with multiple undefined fields on getById', async () => {
		// Create a legacy project with multiple undefined fields
		const legacyProject = {
			id: 'project-2',
			name: 'Broken Project',
			workspaceIds: undefined as any,
			taskCount: undefined as any,
			archived: undefined as any,
			pinned: undefined as any,
			order: undefined as any,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [legacyProject]);

		// Get project via service
		const project = await service.getById('project-2');

		// Should normalize all undefined fields
		expect(project.workspaceIds).toEqual([]);
		expect(project.taskCount).toBe(0);
		expect(project.archived).toBe(false);
		expect(project.pinned).toBe(false);
		expect(project.order).toBe(0);
	});

	it('should normalize projects list on getProjectsData', async () => {
		// Create mix of normalized and legacy projects
		const projects = [
			{
				id: 'project-3',
				name: 'Normal Project',
				workspaceIds: ['ws-1', 'ws-2'],
				taskCount: 3,
				archived: false,
				pinned: false,
				order: 0,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				version: 1,
			},
			{
				id: 'project-4',
				name: 'Legacy Project',
				workspaceIds: undefined as any,
				taskCount: undefined as any,
				archived: false,
				pinned: false,
				order: 0,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				version: 1,
			},
		];

		await storage.seed('projects', projects);

		// Get projects data
		const data = await service.getProjectsData();

		// Should normalize all projects
		expect(data.projects).toHaveLength(2);

		const normalProject = data.projects.find(p => p.id === 'project-3');
		const legacyProject = data.projects.find(p => p.id === 'project-4');

		expect(normalProject?.workspaceIds).toEqual(['ws-1', 'ws-2']);
		expect(legacyProject?.workspaceIds).toEqual([]);
		expect(legacyProject?.taskCount).toBe(0);
	});

	it('should normalize projects list on getProjectsList', async () => {
		// Create legacy project
		const legacyProject = {
			id: 'project-5',
			name: 'Legacy Project',
			workspaceIds: undefined as any,
			taskCount: undefined as any,
			archived: false,
			pinned: false,
			order: 0,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [legacyProject]);

		// Get projects list
		const result = await service.getProjectsList({ page: 1, pageSize: 10 });

		// Should normalize projects in list
		expect(result.items).toHaveLength(1);
		expect(result.items[0].workspaceIds).toEqual([]);
		expect(result.items[0].taskCount).toBe(0);
	});

	it('should normalize created project', async () => {
		// Create project with optional fields omitted
		const newProject = await service.create({
			name: 'New Project',
			description: 'Test project',
			// workspaceIds omitted (should default to [])
			// archived omitted (should default to false)
		});

		// Should have normalized defaults
		expect(newProject.workspaceIds).toEqual([]);
		expect(newProject.taskCount).toBe(0);
		expect(newProject.archived).toBe(false);
		expect(newProject.pinned).toBe(false);
		expect(newProject.order).toBe(0);
	});

	it('should normalize updated project', async () => {
		// Create a legacy project
		const legacyProject = {
			id: 'project-6',
			name: 'Legacy Project',
			workspaceIds: undefined as any,
			taskCount: 5,
			archived: false,
			pinned: false,
			order: 0,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [legacyProject]);

		// Update the project
		const updated = await service.update('project-6', {
			name: 'Updated Name',
			version: 1,
		});

		// Should normalize the returned project
		expect(updated.name).toBe('Updated Name');
		expect(updated.workspaceIds).toEqual([]);
	});

	it('should normalize project after adding workspaces', async () => {
		// Create a legacy project with undefined workspaceIds
		const legacyProject = {
			id: 'project-7',
			name: 'Legacy Project',
			workspaceIds: undefined as any,
			taskCount: 0,
			archived: false,
			pinned: false,
			order: 0,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [legacyProject]);

		// Add workspaces (should handle undefined gracefully)
		const updated = await service.addWorkspaces('project-7', {
			workspaceIds: ['ws-1', 'ws-2'],
		});

		// Should have normalized workspaceIds with new ones added
		expect(updated.workspaceIds).toEqual(['ws-1', 'ws-2']);
	});

	it('should not modify already normalized projects', async () => {
		// Create a properly normalized project
		const normalProject = {
			id: 'project-8',
			name: 'Normal Project',
			workspaceIds: ['ws-1'],
			taskCount: 3,
			archived: false,
			pinned: true,
			order: 2,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [normalProject]);

		// Get project via service
		const project = await service.getById('project-8');

		// Should remain unchanged
		expect(project.workspaceIds).toEqual(['ws-1']);
		expect(project.taskCount).toBe(3);
		expect(project.archived).toBe(false);
		expect(project.pinned).toBe(true);
		expect(project.order).toBe(2);
	});
});
