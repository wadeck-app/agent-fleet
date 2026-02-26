import { describe, expect, it } from 'vitest';

import type { WorkspaceMetadataEntity } from '@app/shared/api/workspaces.contract';

import { WorkspaceMapper } from './WorkspaceMapper';

const baseEntity: WorkspaceMetadataEntity = {
	id: 'abc123',
	version: 1,
	path: 'C:\\projects\\my-app',
	name: 'My App',
	description: 'Test description',
	color: '#FF0000',
	mode: 'development',
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('WorkspaceMapper', () => {
	describe('mapEntityToApi', () => {
		it('should map entity fields correctly', () => {
			const result = WorkspaceMapper.mapEntityToApi(baseEntity);

			expect(result.id).toBe('abc123');
			expect(result.path).toBe('C:\\projects\\my-app');
			expect(result.name).toBe('My App');
			expect(result.description).toBe('Test description');
			expect(result.color).toBe('#FF0000');
			expect(result.mode).toBe('development');
			expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
		});

		it('should set status to idle when no workerInfo provided', () => {
			const result = WorkspaceMapper.mapEntityToApi(baseEntity);

			expect(result.status).toBe('idle');
			expect(result.activeWorkerId).toBeUndefined();
		});

		it('should set status to active when workerInfo is provided', () => {
			const result = WorkspaceMapper.mapEntityToApi(baseEntity, {
				workerId: 'worker-1',
				connectedAt: '2026-01-02T00:00:00.000Z',
			});

			expect(result.status).toBe('active');
			expect(result.activeWorkerId).toBe('worker-1');
		});

		it('should use workerInfo.gitBranch when worker is connected', () => {
			const result = WorkspaceMapper.mapEntityToApi(baseEntity, {
				workerId: 'worker-1',
				connectedAt: '2026-01-02T00:00:00.000Z',
				gitBranch: 'feature/new',
			});

			expect(result.gitBranch).toBe('feature/new');
		});

		it('should fall back to entity.gitBranch when no worker is connected', () => {
			const entityWithBranch = { ...baseEntity, gitBranch: 'main' };

			const result = WorkspaceMapper.mapEntityToApi(entityWithBranch);

			expect(result.gitBranch).toBe('main');
		});

		it('should prefer workerInfo.gitBranch over entity.gitBranch', () => {
			const entityWithBranch = { ...baseEntity, gitBranch: 'old-branch' };

			const result = WorkspaceMapper.mapEntityToApi(entityWithBranch, {
				workerId: 'worker-1',
				connectedAt: '2026-01-02T00:00:00.000Z',
				gitBranch: 'feature/new',
			});

			expect(result.gitBranch).toBe('feature/new');
		});

		it('should return undefined gitBranch when neither entity nor worker has one', () => {
			const result = WorkspaceMapper.mapEntityToApi(baseEntity);

			expect(result.gitBranch).toBeUndefined();
		});

		it('should include projectId when provided', () => {
			const result = WorkspaceMapper.mapEntityToApi(baseEntity, undefined, 'project-42');

			expect(result.projectId).toBe('project-42');
		});

		it('should extract name from path when entity.name is not set', () => {
			const entityWithoutName = { ...baseEntity, name: undefined };

			const result = WorkspaceMapper.mapEntityToApi(entityWithoutName);

			expect(result.name).toBe('my-app');
		});
	});

	describe('generateIdFromPath', () => {
		it('should return consistent 16-char hex ID for the same path', () => {
			const id1 = WorkspaceMapper.generateIdFromPath('/projects/my-app');
			const id2 = WorkspaceMapper.generateIdFromPath('/projects/my-app');

			expect(id1).toBe(id2);
			expect(id1).toHaveLength(16);
		});

		it('should return different IDs for different paths', () => {
			const id1 = WorkspaceMapper.generateIdFromPath('/projects/app-a');
			const id2 = WorkspaceMapper.generateIdFromPath('/projects/app-b');

			expect(id1).not.toBe(id2);
		});
	});

	describe('extractWorkspaceName', () => {
		it('should extract the last segment of a Unix path', () => {
			expect(WorkspaceMapper.extractWorkspaceName('/home/user/projects/my-app')).toBe('my-app');
		});

		it('should extract the last segment of a Windows path', () => {
			expect(WorkspaceMapper.extractWorkspaceName('C:\\projects\\my-app')).toBe('my-app');
		});

		it('should return "Workspace" for empty or root paths', () => {
			expect(WorkspaceMapper.extractWorkspaceName('')).toBe('Workspace');
		});
	});
});
