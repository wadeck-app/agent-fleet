/**
 * Storage Tests — backward compat shim (delegates to KnowledgeStorage)
 * Tests only the knowledge-related functionality that remains in Storage/KnowledgeStorage.
 * Task/Intervention storage is tested via InMemoryOrchestratorStorage.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { directoryExists } from 'test-utils/helpers';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Storage } from './Storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Storage (KnowledgeStorage compat)', () => {
	let dataDir: string;
	let knowledgeDir: string;

	beforeEach(async () => {
		dataDir = Storage.getDataDir();
		knowledgeDir = path.join(dataDir, 'knowledge');
		await cleanupDirectories();
		await Storage.initialize();
	});

	afterEach(async () => {
		await cleanupDirectories();
	});

	async function cleanupDirectories() {
		try {
			await fs.promises.rm(knowledgeDir, { recursive: true, force: true });
			await fs.promises.rm(path.join(dataDir, 'contexts'), { recursive: true, force: true });
		} catch {
			// Ignore errors if directories don't exist
		}
	}

	describe('initialize', () => {
		it('should create knowledge directory', async () => {
			expect(await directoryExists(knowledgeDir)).toBe(true);
		});

		it('should not fail if directories already exist', async () => {
			await expect(Storage.initialize()).resolves.not.toThrow();
		});
	});

	describe('addKnowledge', () => {
		it('should add knowledge entry', async () => {
			await Storage.addKnowledge('test-category', { key: 'value', number: 42 });

			const entries = await Storage.readKnowledge('test-category');
			expect(entries).toHaveLength(1);
			expect(entries[0]).toMatchObject({ category: 'test-category', key: 'value', number: 42 });
			expect(entries[0].timestamp).toBeDefined();
		});

		it('should append multiple entries', async () => {
			await Storage.addKnowledge('test-category', { entry: 1 });
			await Storage.addKnowledge('test-category', { entry: 2 });
			await Storage.addKnowledge('test-category', { entry: 3 });

			const entries = await Storage.readKnowledge('test-category');
			expect(entries).toHaveLength(3);
		});

		it('should create knowledge directory if it does not exist', async () => {
			await fs.promises.rm(knowledgeDir, { recursive: true, force: true });
			await Storage.addKnowledge('test-category', { data: 'test' });
			expect(await directoryExists(knowledgeDir)).toBe(true);
		});
	});

	describe('readKnowledge', () => {
		it('should return empty array for non-existent category', async () => {
			const entries = await Storage.readKnowledge('non-existent-category');
			expect(entries).toEqual([]);
		});

		it('should read knowledge entries', async () => {
			await Storage.addKnowledge('category-1', { data: 'entry-1' });
			await Storage.addKnowledge('category-1', { data: 'entry-2' });

			const entries = await Storage.readKnowledge('category-1');
			expect(entries).toHaveLength(2);
			expect(entries.map(e => e.data)).toEqual(['entry-1', 'entry-2']);
		});

		it('should filter empty lines', async () => {
			const filePath = path.join(knowledgeDir, 'test.jsonl');
			await fs.promises.writeFile(
				filePath,
				'{"timestamp":"2024-01-01T00:00:00.000Z","category":"test","data":"1"}\n\n{"timestamp":"2024-01-01T00:00:01.000Z","category":"test","data":"2"}\n',
				'utf8'
			);
			const entries = await Storage.readKnowledge('test');
			expect(entries).toHaveLength(2);
		});

		it('should throw error for corrupted knowledge file', async () => {
			const filePath = path.join(knowledgeDir, 'corrupted.jsonl');
			await fs.promises.writeFile(filePath, 'invalid json\n', 'utf8');
			await expect(Storage.readKnowledge('corrupted')).rejects.toThrow('Failed to read knowledge from corrupted');
		});
	});

	describe('getTaskContextDir', () => {
		it('should return and create context directory', async () => {
			const dir = await Storage.getTaskContextDir('test-task');
			expect(dir).toContain('test-task');
			expect(dir).toContain('contexts');
			expect(await directoryExists(dir)).toBe(true);
		});

		it('should return same path for same task', async () => {
			const dir1 = await Storage.getTaskContextDir('test-task');
			const dir2 = await Storage.getTaskContextDir('test-task');
			expect(dir1).toBe(dir2);
		});
	});

	describe('getDataDir', () => {
		it('should return data directory path', () => {
			expect(Storage.getDataDir()).toBe(dataDir);
		});
	});
});
