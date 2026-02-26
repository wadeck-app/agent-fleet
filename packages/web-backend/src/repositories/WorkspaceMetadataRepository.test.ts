import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { WorkspaceMetadataEntity } from '@app/shared/api/workspaces.contract';

import { InMemoryStorage } from '../storage/InMemoryStorage';
import { BaseRepository } from './BaseRepository';
import { WorkspaceMetadataRepository } from './WorkspaceMetadataRepository';

describe('WorkspaceMetadataRepository', () => {
	let storage: InMemoryStorage;
	let repo: WorkspaceMetadataRepository;

	beforeEach(() => {
		storage = new InMemoryStorage();
		const base = new BaseRepository<WorkspaceMetadataEntity>('workspaces', storage);
		repo = new WorkspaceMetadataRepository(base);
	});

	afterEach(async () => {
		await storage.clear();
	});

	describe('create', () => {
		it('should create a workspace entity', async () => {
			const entity = await repo.create({
				path: 'C:\\workspaces\\test',
				name: 'Test Workspace',
				mode: 'development',
			});

			expect(entity.id).toBeDefined();
			expect(entity.path).toBe('C:\\workspaces\\test');
			expect(entity.name).toBe('Test Workspace');
			expect(entity.mode).toBe('development');
			expect(entity.version).toBe(1);
			expect(entity.createdAt).toBeDefined();
			expect(entity.updatedAt).toBeDefined();
		});

		it('should enforce path uniqueness', async () => {
			await repo.create({
				path: 'C:\\workspaces\\test',
				name: 'First',
				mode: 'development',
			});

			await expect(
				repo.create({
					path: 'C:\\workspaces\\test',
					name: 'Duplicate',
					mode: 'development',
				})
			).rejects.toThrow('Workspace metadata already exists for path');
		});
	});

	describe('findByPath', () => {
		it('should find entity by path', async () => {
			await repo.create({
				path: 'C:\\workspaces\\test',
				name: 'Test',
				mode: 'development',
			});

			const found = await repo.findByPath('C:\\workspaces\\test');
			expect(found).not.toBeNull();
			expect(found!.name).toBe('Test');
		});

		it('should return null for unknown path', async () => {
			const found = await repo.findByPath('C:\\unknown');
			expect(found).toBeNull();
		});
	});

	describe('findByPaths', () => {
		it('should return map of matching entities', async () => {
			await repo.create({ path: 'C:\\ws\\a', name: 'A', mode: 'development' });
			await repo.create({ path: 'C:\\ws\\b', name: 'B', mode: 'production' });
			await repo.create({ path: 'C:\\ws\\c', name: 'C', mode: 'staging' });

			const map = await repo.findByPaths(['C:\\ws\\a', 'C:\\ws\\c']);
			expect(map.size).toBe(2);
			expect(map.get('C:\\ws\\a')!.name).toBe('A');
			expect(map.get('C:\\ws\\c')!.name).toBe('C');
		});

		it('should return empty map when no paths match', async () => {
			const map = await repo.findByPaths(['C:\\unknown']);
			expect(map.size).toBe(0);
		});
	});

	describe('upsertByPath', () => {
		it('should create entity if path does not exist', async () => {
			const entity = await repo.upsertByPath('C:\\ws\\new', {
				name: 'New Workspace',
				color: '#FF0000',
			});

			expect(entity.path).toBe('C:\\ws\\new');
			expect(entity.name).toBe('New Workspace');
			expect(entity.color).toBe('#FF0000');
			expect(entity.mode).toBe('development');
		});

		it('should update entity if path exists', async () => {
			await repo.create({
				path: 'C:\\ws\\existing',
				name: 'Original',
				mode: 'development',
			});

			const updated = await repo.upsertByPath('C:\\ws\\existing', {
				name: 'Updated',
				color: '#00FF00',
			});

			expect(updated.name).toBe('Updated');
			expect(updated.color).toBe('#00FF00');

			// Should still be only one entity for this path
			const all = await repo.findAll();
			const matching = all.filter(e => e.path === 'C:\\ws\\existing');
			expect(matching).toHaveLength(1);
		});
	});

	describe('ensureByPath', () => {
		it('should return existing entity if path exists', async () => {
			const created = await repo.create({
				path: 'C:\\ws\\existing',
				name: 'Existing',
				mode: 'production',
			});

			const ensured = await repo.ensureByPath('C:\\ws\\existing');
			expect(ensured.id).toBe(created.id);
			expect(ensured.name).toBe('Existing');
		});

		it('should create entity with defaults if path does not exist', async () => {
			const ensured = await repo.ensureByPath('C:\\ws\\my-project');

			expect(ensured.path).toBe('C:\\ws\\my-project');
			expect(ensured.name).toBe('my-project');
			expect(ensured.mode).toBe('development');
		});
	});

	describe('update', () => {
		it('should update metadata fields', async () => {
			const created = await repo.create({
				path: 'C:\\ws\\test',
				name: 'Original',
				mode: 'development',
			});

			const updated = await repo.update(created.id, {
				name: 'Updated Name',
				description: 'A description',
				color: '#0000FF',
			});

			expect(updated.name).toBe('Updated Name');
			expect(updated.description).toBe('A description');
			expect(updated.color).toBe('#0000FF');
			expect(updated.path).toBe('C:\\ws\\test');
		});
	});

	describe('delete', () => {
		it('should remove entity', async () => {
			const created = await repo.create({
				path: 'C:\\ws\\delete-me',
				name: 'Delete Me',
				mode: 'development',
			});

			await repo.delete(created.id);

			const found = await repo.findById(created.id);
			expect(found).toBeNull();
		});
	});

	describe('findAll', () => {
		it('should return all entities', async () => {
			await repo.create({ path: 'C:\\ws\\a', name: 'A', mode: 'development' });
			await repo.create({ path: 'C:\\ws\\b', name: 'B', mode: 'production' });

			const all = await repo.findAll();
			expect(all).toHaveLength(2);
		});
	});
});
