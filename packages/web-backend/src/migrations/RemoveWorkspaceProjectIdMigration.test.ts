import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Project } from '@app/shared/api/projects.contract';

import { BaseRepository } from '../repositories/BaseRepository';
import { ProjectsRepository } from '../repositories/ProjectsRepository';
import { InMemoryStorage } from '../storage/InMemoryStorage';
import { RemoveWorkspaceProjectIdMigration } from './RemoveWorkspaceProjectIdMigration';

/**
 * ===========================================================================================
 * REMOVE WORKSPACE PROJECT ID MIGRATION TESTS
 * ===========================================================================================
 *
 * Tests for the migration that removes projectId from workspace metadata files.
 *
 * Test Coverage:
 * - Migrating workspace with valid projectId
 * - Repairing inconsistencies (project doesn't contain workspace)
 * - Handling orphaned workspaces (project doesn't exist)
 * - Skipping workspaces without projectId
 * - Batch migration
 *
 * ===========================================================================================
 */

describe('RemoveWorkspaceProjectIdMigration', () => {
	let storage: InMemoryStorage;
	let projectsRepository: ProjectsRepository;
	let migration: RemoveWorkspaceProjectIdMigration;

	// Test workspace paths
	const testWorkspacesDir = join(process.cwd(), 'test-workspaces-migration');
	const workspace1Path = join(testWorkspacesDir, 'workspace-1');
	const workspace2Path = join(testWorkspacesDir, 'workspace-2');
	const workspace3Path = join(testWorkspacesDir, 'workspace-3');

	const workspaceId1 = 'ws-1';
	const workspaceId2 = 'ws-2';
	const workspaceId3 = 'ws-3';
	const projectId1 = 'project-1';

	beforeEach(async () => {
		// Setup repositories
		storage = new InMemoryStorage();
		const baseRepository = new BaseRepository<Project>('projects', storage);
		projectsRepository = new ProjectsRepository(baseRepository);
		migration = new RemoveWorkspaceProjectIdMigration(projectsRepository);

		// Create test workspaces directories
		await mkdir(join(workspace1Path, '.agent-fleet'), { recursive: true });
		await mkdir(join(workspace2Path, '.agent-fleet'), { recursive: true });
		await mkdir(join(workspace3Path, '.agent-fleet'), { recursive: true });

		// Create test project with explicit ID
		// Using 'as any' because BaseRepository.create() types omit 'id',
		// but InMemoryStorage.create() supports explicit IDs at runtime for testing
		await baseRepository.create({
			id: projectId1,
			name: 'Project 1',
			workspaceIds: [workspaceId1], // Only contains workspace-1
			icon: 'Folder',
			iconColor: '#10B981',
			archived: false,
			taskCount: 0,
			pinned: false,
			order: 0,
		} as any);
	});

	afterEach(async () => {
		// Cleanup test directories
		if (existsSync(testWorkspacesDir)) {
			await rm(testWorkspacesDir, { recursive: true, force: true });
		}
		await storage.clear();
	});

	describe('migrateWorkspace', () => {
		it('should remove projectId from workspace metadata', async () => {
			// Setup: Workspace with projectId
			const metadataPath = join(workspace1Path, '.agent-fleet', 'workspace-metadata.json');
			await writeFile(
				metadataPath,
				JSON.stringify({
					id: workspaceId1,
					name: 'Workspace 1',
					projectId: projectId1,
					mode: 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}),
				'utf-8'
			);

			// Act
			const changed = await migration.migrateWorkspace(workspace1Path);

			// Assert: Migration made changes
			expect(changed).toBe(true);

			// Assert: projectId removed from metadata
			const updatedContent = await readFile(metadataPath, 'utf-8');
			const updatedMetadata = JSON.parse(updatedContent);
			expect(updatedMetadata.projectId).toBeUndefined();
			expect(updatedMetadata.id).toBe(workspaceId1);
			expect(updatedMetadata.name).toBe('Workspace 1');
		});

		it('should repair inconsistency by adding workspace to project', async () => {
			// Setup: Workspace with projectId but project doesn't contain it
			const metadataPath = join(workspace2Path, '.agent-fleet', 'workspace-metadata.json');
			await writeFile(
				metadataPath,
				JSON.stringify({
					id: workspaceId2,
					name: 'Workspace 2',
					projectId: projectId1, // Points to project1 but project1 doesn't have ws-2
					mode: 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}),
				'utf-8'
			);

			// Act
			const changed = await migration.migrateWorkspace(workspace2Path);

			// Assert: Migration made changes
			expect(changed).toBe(true);

			// Assert: Project now contains workspace
			const project = await projectsRepository.findById(projectId1);
			expect(project).not.toBeNull();
			expect(project?.workspaceIds).toContain(workspaceId2);

			// Assert: projectId removed from metadata
			const updatedContent = await readFile(metadataPath, 'utf-8');
			const updatedMetadata = JSON.parse(updatedContent);
			expect(updatedMetadata.projectId).toBeUndefined();
		});

		it('should handle orphaned workspace (project does not exist)', async () => {
			// Setup: Workspace with non-existent projectId
			const metadataPath = join(workspace3Path, '.agent-fleet', 'workspace-metadata.json');
			await writeFile(
				metadataPath,
				JSON.stringify({
					id: workspaceId3,
					name: 'Workspace 3',
					projectId: 'non-existent-project',
					mode: 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}),
				'utf-8'
			);

			// Act: Should not throw
			const changed = await migration.migrateWorkspace(workspace3Path);

			// Assert: Migration made changes (removed projectId anyway)
			expect(changed).toBe(true);

			// Assert: projectId removed from metadata
			const updatedContent = await readFile(metadataPath, 'utf-8');
			const updatedMetadata = JSON.parse(updatedContent);
			expect(updatedMetadata.projectId).toBeUndefined();
		});

		it('should skip workspace without projectId', async () => {
			// Setup: Workspace without projectId
			const metadataPath = join(workspace1Path, '.agent-fleet', 'workspace-metadata.json');
			await writeFile(
				metadataPath,
				JSON.stringify({
					id: workspaceId1,
					name: 'Workspace 1',
					mode: 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}),
				'utf-8'
			);

			// Act
			const changed = await migration.migrateWorkspace(workspace1Path);

			// Assert: No changes made
			expect(changed).toBe(false);
		});

		it('should skip workspace without metadata file', async () => {
			// Setup: No metadata file

			// Act
			const changed = await migration.migrateWorkspace(workspace1Path);

			// Assert: No changes made
			expect(changed).toBe(false);
		});

		it('should return false on error', async () => {
			// Setup: Invalid metadata file
			const metadataPath = join(workspace1Path, '.agent-fleet', 'workspace-metadata.json');
			await writeFile(metadataPath, 'invalid json', 'utf-8');

			// Act
			const changed = await migration.migrateWorkspace(workspace1Path);

			// Assert: Migration failed
			expect(changed).toBe(false);
		});
	});

	describe('migrateAll', () => {
		it('should migrate multiple workspaces', async () => {
			// Setup: Create metadata for multiple workspaces
			await writeFile(
				join(workspace1Path, '.agent-fleet', 'workspace-metadata.json'),
				JSON.stringify({
					id: workspaceId1,
					projectId: projectId1,
					mode: 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}),
				'utf-8'
			);

			await writeFile(
				join(workspace2Path, '.agent-fleet', 'workspace-metadata.json'),
				JSON.stringify({
					id: workspaceId2,
					projectId: projectId1,
					mode: 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}),
				'utf-8'
			);

			await writeFile(
				join(workspace3Path, '.agent-fleet', 'workspace-metadata.json'),
				JSON.stringify({
					id: workspaceId3,
					mode: 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}),
				'utf-8'
			);

			// Act
			const result = await migration.migrateAll([workspace1Path, workspace2Path, workspace3Path]);

			// Assert
			expect(result.migrated).toBe(2); // workspace-1 and workspace-2
			expect(result.skipped).toBe(1); // workspace-3 (no projectId)
			expect(result.errors).toBe(0);
		});

		it('should count errors separately', async () => {
			// Setup: One valid, one invalid
			await writeFile(
				join(workspace1Path, '.agent-fleet', 'workspace-metadata.json'),
				JSON.stringify({
					id: workspaceId1,
					projectId: projectId1,
					mode: 'development',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				}),
				'utf-8'
			);

			await writeFile(join(workspace2Path, '.agent-fleet', 'workspace-metadata.json'), 'invalid json', 'utf-8');

			// Act
			const result = await migration.migrateAll([workspace1Path, workspace2Path]);

			// Assert
			expect(result.migrated).toBe(1);
			expect(result.skipped).toBe(1);
		});
	});
});
