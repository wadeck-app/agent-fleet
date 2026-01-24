import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Project } from '@app/shared/api/projects.contract';

import { InMemoryStorage } from '../storage/InMemoryStorage';
import { NormalizeProjectsMigration } from './NormalizeProjectsMigration';

describe('NormalizeProjectsMigration', () => {
	let storage: InMemoryStorage;
	let migration: NormalizeProjectsMigration;

	beforeEach(async () => {
		storage = new InMemoryStorage();
		migration = new NormalizeProjectsMigration(storage);
	});

	afterEach(async () => {
		await storage.clear();
	});

	it('should normalize projects with undefined workspaceIds', async () => {
		// Create a project with undefined workspaceIds (legacy data)
		const legacyProject = {
			id: 'project-1',
			name: 'Legacy Project',
			description: 'A project with undefined fields',
			workspaceIds: undefined as any, // Simulate legacy data
			taskCount: 5,
			archived: false,
			pinned: true,
			order: 1,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [legacyProject]);

		// Run migration
		const updatedCount = await migration.run();

		// Verify migration ran
		expect(updatedCount).toBe(1);

		// Verify project was normalized
		const normalizedProject = await storage.getById<Project>('projects', 'project-1');
		expect(normalizedProject).toBeDefined();
		expect(normalizedProject?.workspaceIds).toEqual([]);
	});

	it('should normalize projects with multiple undefined fields', async () => {
		// Create a project with multiple undefined fields
		const legacyProject = {
			id: 'project-2',
			name: 'Broken Project',
			description: 'Multiple undefined fields',
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

		// Run migration
		const updatedCount = await migration.run();

		// Verify migration ran
		expect(updatedCount).toBe(1);

		// Verify all fields were normalized
		const normalizedProject = await storage.getById<Project>('projects', 'project-2');
		expect(normalizedProject).toBeDefined();
		expect(normalizedProject?.workspaceIds).toEqual([]);
		expect(normalizedProject?.taskCount).toBe(0);
		expect(normalizedProject?.archived).toBe(false);
		expect(normalizedProject?.pinned).toBe(false);
		expect(normalizedProject?.order).toBe(0);
	});

	it('should not modify projects that are already normalized', async () => {
		// Create a properly normalized project
		const normalizedProject = {
			id: 'project-3',
			name: 'Normal Project',
			description: 'Already normalized',
			workspaceIds: ['ws-1', 'ws-2'],
			taskCount: 3,
			archived: false,
			pinned: false,
			order: 2,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [normalizedProject]);

		// Run migration
		const updatedCount = await migration.run();

		// Verify no updates were made
		expect(updatedCount).toBe(0);

		// Verify project remains unchanged
		const unchangedProject = await storage.getById<Project>('projects', 'project-3');
		expect(unchangedProject).toEqual(normalizedProject);
	});

	it('should handle mixed scenarios (some normalized, some not)', async () => {
		// Create mix of normalized and legacy projects
		const projects = [
			{
				id: 'project-4',
				name: 'Normal Project',
				workspaceIds: ['ws-1'],
				taskCount: 1,
				archived: false,
				pinned: false,
				order: 0,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				version: 1,
			},
			{
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
			},
			{
				id: 'project-6',
				name: 'Another Legacy Project',
				workspaceIds: undefined as any,
				taskCount: 5,
				archived: undefined as any,
				pinned: false,
				order: 0,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				version: 1,
			},
		];

		await storage.seed('projects', projects);

		// Run migration
		const updatedCount = await migration.run();

		// Verify only legacy projects were updated
		expect(updatedCount).toBe(2);

		// Verify all projects are now normalized
		const project4 = await storage.getById<Project>('projects', 'project-4');
		const project5 = await storage.getById<Project>('projects', 'project-5');
		const project6 = await storage.getById<Project>('projects', 'project-6');

		expect(project4?.workspaceIds).toEqual(['ws-1']);
		expect(project5?.workspaceIds).toEqual([]);
		expect(project5?.taskCount).toBe(0);
		expect(project6?.workspaceIds).toEqual([]);
		expect(project6?.archived).toBe(false);
	});

	it('should be idempotent (safe to run multiple times)', async () => {
		// Create a legacy project
		const legacyProject = {
			id: 'project-7',
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

		// Run migration first time
		const firstRunCount = await migration.run();
		expect(firstRunCount).toBe(1);

		// Verify migration tracking was created
		const hasRun = await migration.hasRun();
		expect(hasRun).toBe(true);

		// Run migration second time (should skip)
		const secondRunCount = await migration.run();
		expect(secondRunCount).toBe(0);

		// Verify project is still normalized
		const normalizedProject = await storage.getById<Project>('projects', 'project-7');
		expect(normalizedProject?.workspaceIds).toEqual([]);
		expect(normalizedProject?.taskCount).toBe(0);
	});

	it('should handle force re-run correctly', async () => {
		// Create a legacy project
		const legacyProject = {
			id: 'project-8',
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

		// Run normal migration
		await migration.run();

		// Manually corrupt the data again
		await storage.update<Project>('projects', 'project-8', {
			workspaceIds: undefined as any,
		});

		// Force re-run should fix it again
		const forceRunCount = await migration.forceRun();
		expect(forceRunCount).toBe(1);

		// Verify project is normalized again
		const normalizedProject = await storage.getById<Project>('projects', 'project-8');
		expect(normalizedProject?.workspaceIds).toEqual([]);
	});

	it('should handle null values same as undefined', async () => {
		// Create a project with null values (another form of legacy data)
		const nullProject = {
			id: 'project-9',
			name: 'Null Project',
			workspaceIds: null as any,
			taskCount: null as any,
			archived: null as any,
			pinned: null as any,
			order: null as any,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			version: 1,
		};

		await storage.seed('projects', [nullProject]);

		// Run migration
		const updatedCount = await migration.run();

		// Verify migration ran
		expect(updatedCount).toBe(1);

		// Verify all null values were replaced with defaults
		const normalizedProject = await storage.getById<Project>('projects', 'project-9');
		expect(normalizedProject).toBeDefined();
		expect(normalizedProject?.workspaceIds).toEqual([]);
		expect(normalizedProject?.taskCount).toBe(0);
		expect(normalizedProject?.archived).toBe(false);
		expect(normalizedProject?.pinned).toBe(false);
		expect(normalizedProject?.order).toBe(0);
	});
});
