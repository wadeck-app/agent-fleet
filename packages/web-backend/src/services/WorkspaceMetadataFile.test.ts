import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceMetadataFile } from './WorkspaceMetadataFile';

describe('WorkspaceMetadataFile', () => {
	let service: WorkspaceMetadataFile;
	let testWorkspacePath: string;

	beforeEach(async () => {
		service = new WorkspaceMetadataFile();
		// Create temporary test workspace
		testWorkspacePath = join(process.cwd(), 'temp-test-workspace-' + Date.now());
		await mkdir(testWorkspacePath, { recursive: true });
	});

	afterEach(async () => {
		// Cleanup test workspace
		try {
			await rm(testWorkspacePath, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	describe('read()', () => {
		it('should return null when metadata file does not exist', async () => {
			const result = await service.read(testWorkspacePath);
			expect(result).toBeNull();
		});

		it('should read existing metadata file', async () => {
			// Create metadata file
			const metadataDir = join(testWorkspacePath, '.agent-fleet');
			await mkdir(metadataDir, { recursive: true });

			const metadata = {
				id: 'test-id-123',
				name: 'Test Workspace',
				description: 'Test description',
				mode: 'development' as const,
				createdAt: '2025-12-31T10:00:00.000Z',
				updatedAt: '2025-12-31T10:00:00.000Z',
			};

			await writeFile(join(metadataDir, 'workspace-metadata.json'), JSON.stringify(metadata), 'utf-8');

			const result = await service.read(testWorkspacePath);

			expect(result).toEqual(metadata);
		});

		it('should return null for corrupted metadata file', async () => {
			// Create corrupted metadata file
			const metadataDir = join(testWorkspacePath, '.agent-fleet');
			await mkdir(metadataDir, { recursive: true });
			await writeFile(join(metadataDir, 'workspace-metadata.json'), 'invalid json', 'utf-8');

			const result = await service.read(testWorkspacePath);

			expect(result).toBeNull();
		});

		it('should return null for metadata file missing required fields', async () => {
			// Create metadata file without required fields
			const metadataDir = join(testWorkspacePath, '.agent-fleet');
			await mkdir(metadataDir, { recursive: true });

			const invalidMetadata = {
				name: 'Test Workspace',
				// Missing id, createdAt, updatedAt
			};

			await writeFile(join(metadataDir, 'workspace-metadata.json'), JSON.stringify(invalidMetadata), 'utf-8');

			const result = await service.read(testWorkspacePath);

			expect(result).toBeNull();
		});
	});

	describe('write()', () => {
		it('should create metadata file with provided data', async () => {
			const metadata = {
				name: 'My Workspace',
				description: 'Test workspace',
				mode: 'production' as const,
			};

			const result = await service.write(testWorkspacePath, metadata);

			expect(result.name).toBe('My Workspace');
			expect(result.description).toBe('Test workspace');
			expect(result.mode).toBe('production');
			expect(result.id).toBeDefined();
			expect(result.createdAt).toBeDefined();
			expect(result.updatedAt).toBeDefined();

			// Verify file exists
			const metadataPath = join(testWorkspacePath, '.agent-fleet', 'workspace-metadata.json');
			const fileContent = await readFile(metadataPath, 'utf-8');
			const parsed = JSON.parse(fileContent);

			expect(parsed).toEqual(result);
		});

		it('should update existing metadata while preserving id and createdAt', async () => {
			// Create initial metadata
			const initial = {
				id: 'original-id',
				name: 'Original Name',
				createdAt: '2025-12-30T10:00:00.000Z',
			};

			await service.write(testWorkspacePath, initial);

			// Update metadata
			const updated = {
				name: 'Updated Name',
				description: 'New description',
			};

			const result = await service.write(testWorkspacePath, updated);

			expect(result.id).toBe('original-id');
			expect(result.name).toBe('Updated Name');
			expect(result.description).toBe('New description');
			expect(result.createdAt).toBe('2025-12-30T10:00:00.000Z');
			expect(result.updatedAt).not.toBe('2025-12-30T10:00:00.000Z');
		});

		it('should create .agent-fleet directory if it does not exist', async () => {
			const metadata = {
				name: 'Test',
			};

			await service.write(testWorkspacePath, metadata);

			const metadataPath = join(testWorkspacePath, '.agent-fleet', 'workspace-metadata.json');
			const fileContent = await readFile(metadataPath, 'utf-8');

			expect(fileContent).toBeDefined();
		});
	});

	describe('ensureFile()', () => {
		it('should create metadata file with defaults if missing', async () => {
			const result = await service.ensureFile(testWorkspacePath);

			expect(result.id).toBeDefined();
			expect(result.name).toBeDefined();
			expect(result.mode).toBe('development');
			expect(result.createdAt).toBeDefined();
			expect(result.updatedAt).toBeDefined();
		});

		it('should return existing metadata if file exists', async () => {
			// Create metadata
			const initial = await service.ensureFile(testWorkspacePath);

			// Call again
			const result = await service.ensureFile(testWorkspacePath);

			expect(result.id).toBe(initial.id);
			expect(result.createdAt).toBe(initial.createdAt);
		});

		it('should extract workspace name from path', async () => {
			const result = await service.ensureFile(testWorkspacePath);

			// Should use the last segment of the path as name
			expect(result.name).toContain('temp-test-workspace-');
		});
	});
});
