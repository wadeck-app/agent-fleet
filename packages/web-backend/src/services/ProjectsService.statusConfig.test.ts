import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectStatusConfig } from '@app/shared/api/projects.contract';
import { DEFAULT_STATUS_CONFIG } from '@app/shared/api/projects.contract';
import { NotFoundException } from '@app/shared/exceptions/http-exceptions';

import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import type { ProjectsRepository } from '../repositories/ProjectsRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import { ProjectsService } from './ProjectsService';

/**
 * Minimal in-memory stub for ProjectsRepository.
 * Uses a Map to simulate storage without I/O.
 */
function makeProjectsRepoStub(initialProjects: Record<string, any> = {}) {
	const store = new Map<string, any>(Object.entries(initialProjects));

	return {
		findAll: vi.fn().mockResolvedValue([...store.values()]),
		findById: vi.fn(async (id: string) => store.get(id) ?? null),
		create: vi.fn(),
		update: vi.fn(async (id: string, data: any) => {
			const existing = store.get(id);
			if (!existing) throw new Error(`Not found: ${id}`);
			const updated = { ...existing, ...data };
			store.set(id, updated);
			return updated;
		}),
		delete: vi.fn(),
		findByName: vi.fn(),
		findNonArchived: vi.fn(),
		addWorkspaces: vi.fn(),
		removeWorkspace: vi.fn(),
		updateTaskCount: vi.fn(),
		getProjectForWorkspace: vi.fn(),
		// Status config methods (real implementation, backed by the store)
		getStatusConfig: vi.fn(async (projectId: string) => {
			const project = store.get(projectId);
			if (!project) throw new Error(`Project with id ${projectId} not found`);
			return project.statusConfig ?? DEFAULT_STATUS_CONFIG;
		}),
		saveStatusConfig: vi.fn(async (projectId: string, config: ProjectStatusConfig) => {
			const project = store.get(projectId);
			if (!project) throw new Error(`Project with id ${projectId} not found`);
			store.set(projectId, { ...project, statusConfig: config });
		}),
	} as unknown as ProjectsRepository;
}

function makeProject(id: string, overrides: Record<string, any> = {}) {
	return {
		id,
		name: `Project ${id}`,
		workspaceIds: [],
		taskCount: 0,
		archived: false,
		pinned: false,
		order: 0,
		version: 1,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function makeService(repo: ProjectsRepository) {
	const orchestratorRepo = {
		getTasks: vi.fn().mockResolvedValue([]),
	} as unknown as OrchestratorRepository;

	const eventBroadcaster = {
		broadcast: vi.fn(),
	} as unknown as EventBroadcaster;

	const orchestratorWrapper = {} as unknown as OrchestratorWrapper;

	return new ProjectsService(repo, orchestratorRepo, eventBroadcaster, orchestratorWrapper);
}

describe('ProjectsService – status config', () => {
	describe('getStatusConfig', () => {
		it('returns DEFAULT_STATUS_CONFIG when no config is stored', async () => {
			const project = makeProject('proj-1');
			const repo = makeProjectsRepoStub({ 'proj-1': project });
			const service = makeService(repo);

			const result = await service.getStatusConfig('proj-1');

			expect(result).toEqual(DEFAULT_STATUS_CONFIG);
		});

		it('returns stored config when one exists', async () => {
			const customConfig: ProjectStatusConfig = {
				statuses: [{ id: 'open', label: 'Open', terminal: false }],
				transitions: [],
			};
			const project = makeProject('proj-2', { statusConfig: customConfig });
			const repo = makeProjectsRepoStub({ 'proj-2': project });
			const service = makeService(repo);

			const result = await service.getStatusConfig('proj-2');

			expect(result).toEqual(customConfig);
		});

		it('throws NotFoundException when project does not exist', async () => {
			const repo = makeProjectsRepoStub({});
			const service = makeService(repo);

			await expect(service.getStatusConfig('missing-proj')).rejects.toThrow(NotFoundException);
		});
	});

	describe('saveStatusConfig', () => {
		it('saves config and returns it when transitions are valid', async () => {
			const project = makeProject('proj-3');
			const repo = makeProjectsRepoStub({ 'proj-3': project });
			const service = makeService(repo);

			const config: ProjectStatusConfig = {
				statuses: [
					{ id: 'todo', label: 'To Do', terminal: false },
					{ id: 'done', label: 'Done', terminal: true },
				],
				transitions: [{ from: 'todo', to: 'done' }],
			};

			const result = await service.saveStatusConfig('proj-3', config);

			expect(result).toEqual(config);
			expect(repo.saveStatusConfig).toHaveBeenCalledWith('proj-3', config);
		});

		it('throws when a transition "from" references an unknown status id', async () => {
			const project = makeProject('proj-4');
			const repo = makeProjectsRepoStub({ 'proj-4': project });
			const service = makeService(repo);

			const config: ProjectStatusConfig = {
				statuses: [{ id: 'todo', label: 'To Do', terminal: false }],
				transitions: [{ from: 'unknown-status', to: 'todo' }],
			};

			await expect(service.saveStatusConfig('proj-4', config)).rejects.toThrow(/"from" value "unknown-status"/);
		});

		it('throws when a transition "to" references an unknown status id', async () => {
			const project = makeProject('proj-5');
			const repo = makeProjectsRepoStub({ 'proj-5': project });
			const service = makeService(repo);

			const config: ProjectStatusConfig = {
				statuses: [{ id: 'todo', label: 'To Do', terminal: false }],
				transitions: [{ from: 'todo', to: 'does-not-exist' }],
			};

			await expect(service.saveStatusConfig('proj-5', config)).rejects.toThrow(/"to" value "does-not-exist"/);
		});

		it('throws NotFoundException when project does not exist', async () => {
			const repo = makeProjectsRepoStub({});
			const service = makeService(repo);

			const config: ProjectStatusConfig = {
				statuses: [{ id: 'todo', label: 'To Do', terminal: false }],
				transitions: [],
			};

			await expect(service.saveStatusConfig('ghost-proj', config)).rejects.toThrow(NotFoundException);
		});

		it('accepts empty transitions array without throwing', async () => {
			const project = makeProject('proj-6');
			const repo = makeProjectsRepoStub({ 'proj-6': project });
			const service = makeService(repo);

			const config: ProjectStatusConfig = {
				statuses: [{ id: 'todo', label: 'To Do', terminal: false }],
				transitions: [],
			};

			const result = await service.saveStatusConfig('proj-6', config);
			expect(result).toEqual(config);
		});
	});
});
