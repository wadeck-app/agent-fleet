import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Project } from '@app/shared/api/projects.contract';

import { InMemoryStorage } from '../storage/InMemoryStorage';
import { BaseRepository } from './BaseRepository';
import { ProjectsRepository } from './ProjectsRepository';

/**
 * ===========================================================================================
 * PROJECTS REPOSITORY TESTS
 * ===========================================================================================
 *
 * Tests for domain-specific project operations.
 *
 * Test Coverage:
 * - Finding projects with filters
 * - Adding/removing workspaces from projects
 * - Getting project for workspace (single source of truth)
 * - Task count management
 *
 * ===========================================================================================
 */

describe('ProjectsRepository', () => {
	let storage: InMemoryStorage;
	let repository: ProjectsRepository;

	// Test data
	const testProject1: Omit<Project, 'id' | 'version' | 'createdAt' | 'updatedAt'> = {
		name: 'Project 1',
		workspaceIds: ['workspace-1', 'workspace-2'],
		icon: 'Folder',
		iconColor: '#10B981',
		archived: false,
		taskCount: 0,
		pinned: false,
		order: 0,
	};

	const testProject2: Omit<Project, 'id' | 'version' | 'createdAt' | 'updatedAt'> = {
		name: 'Project 2',
		workspaceIds: ['workspace-3'],
		icon: 'Folder',
		iconColor: '#F59E0B',
		archived: false,
		taskCount: 0,
		pinned: false,
		order: 1,
	};

	beforeEach(async () => {
		storage = new InMemoryStorage();
		const baseRepository = new BaseRepository<Project>('projects', storage);
		repository = new ProjectsRepository(baseRepository);
	});

	afterEach(async () => {
		await storage.clear();
	});

	describe('findAll', () => {
		it('should return all projects', async () => {
			// Setup
			await repository.create(testProject1);
			await repository.create(testProject2);

			// Act
			const projects = await repository.findAll();

			// Assert
			expect(projects).toHaveLength(2);
		});

		it('should filter by archived status', async () => {
			// Setup
			await repository.create(testProject1);
			await repository.create({ ...testProject2, archived: true });

			// Act
			const projects = await repository.findAll({ archived: false });

			// Assert
			expect(projects).toHaveLength(1);
			expect(projects[0].name).toBe('Project 1');
		});

		it('should filter by workspaceId', async () => {
			// Setup
			await repository.create(testProject1);
			await repository.create(testProject2);

			// Act
			const projects = await repository.findAll({ workspaceId: 'workspace-1' });

			// Assert
			expect(projects).toHaveLength(1);
			expect(projects[0].name).toBe('Project 1');
		});
	});

	describe('addWorkspaces', () => {
		it('should add workspaces to project', async () => {
			// Setup
			const project = await repository.create(testProject1);

			// Act
			const updated = await repository.addWorkspaces(project.id, ['workspace-4', 'workspace-5']);

			// Assert
			expect(updated.workspaceIds).toContain('workspace-4');
			expect(updated.workspaceIds).toContain('workspace-5');
			expect(updated.workspaceIds).toHaveLength(4); // 2 original + 2 new
		});

		it('should avoid duplicate workspace IDs', async () => {
			// Setup
			const project = await repository.create(testProject1);

			// Act: Add workspace-1 again (already exists)
			const updated = await repository.addWorkspaces(project.id, ['workspace-1', 'workspace-4']);

			// Assert: workspace-1 should not be duplicated
			expect(updated.workspaceIds.filter(id => id === 'workspace-1')).toHaveLength(1);
			expect(updated.workspaceIds).toContain('workspace-4');
		});

		it('should throw error for non-existent project', async () => {
			// Act & Assert
			await expect(repository.addWorkspaces('non-existent', ['workspace-1'])).rejects.toThrow(
				'Project with id non-existent not found'
			);
		});
	});

	describe('removeWorkspace', () => {
		it('should remove workspace from project', async () => {
			// Setup
			const project = await repository.create(testProject1);

			// Act
			const updated = await repository.removeWorkspace(project.id, 'workspace-1');

			// Assert
			expect(updated.workspaceIds).not.toContain('workspace-1');
			expect(updated.workspaceIds).toHaveLength(1); // Only workspace-2 remains
		});

		it('should handle removing non-existent workspace gracefully', async () => {
			// Setup
			const project = await repository.create(testProject1);

			// Act
			const updated = await repository.removeWorkspace(project.id, 'non-existent-workspace');

			// Assert: workspaceIds unchanged
			expect(updated.workspaceIds).toEqual(project.workspaceIds);
		});

		it('should throw error for non-existent project', async () => {
			// Act & Assert
			await expect(repository.removeWorkspace('non-existent', 'workspace-1')).rejects.toThrow(
				'Project with id non-existent not found'
			);
		});
	});

	describe('getProjectForWorkspace', () => {
		it('should return project containing the workspace', async () => {
			// Setup
			await repository.create(testProject1);
			await repository.create(testProject2);

			// Act
			const project = await repository.getProjectForWorkspace('workspace-1');

			// Assert
			expect(project).not.toBeNull();
			expect(project!.name).toBe('Project 1');
		});

		it('should return null if workspace is not in any project', async () => {
			// Setup
			await repository.create(testProject1);

			// Act
			const project = await repository.getProjectForWorkspace('non-existent-workspace');

			// Assert
			expect(project).toBeNull();
		});

		it('should return first project if workspace is in multiple projects', async () => {
			// Setup: Both projects have workspace-1 (edge case, shouldn't happen in practice)
			await repository.create(testProject1);
			await repository.create({ ...testProject2, workspaceIds: ['workspace-1', 'workspace-3'] });

			// Act
			const project = await repository.getProjectForWorkspace('workspace-1');

			// Assert: Returns first match
			expect(project).not.toBeNull();
			expect(project!.workspaceIds).toContain('workspace-1');
		});
	});

	describe('updateTaskCount', () => {
		it('should increment task count', async () => {
			// Setup
			const project = await repository.create(testProject1);

			// Act
			const updated = await repository.updateTaskCount(project.id, 5);

			// Assert
			expect(updated.taskCount).toBe(5);
		});

		it('should decrement task count', async () => {
			// Setup
			const project = await repository.create({ ...testProject1, taskCount: 10 });

			// Act
			const updated = await repository.updateTaskCount(project.id, -3);

			// Assert
			expect(updated.taskCount).toBe(7);
		});

		it('should not allow negative task count', async () => {
			// Setup
			const project = await repository.create({ ...testProject1, taskCount: 2 });

			// Act
			const updated = await repository.updateTaskCount(project.id, -5);

			// Assert: taskCount clamped to 0
			expect(updated.taskCount).toBe(0);
		});
	});
});
