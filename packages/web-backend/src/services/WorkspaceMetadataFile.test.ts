import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkspaceMetadataFile } from './WorkspaceMetadataFile';

describe('WorkspaceMetadataFile', () => {
	let service: WorkspaceMetadataFile;
	let testWorkspacePath: string;

	beforeEach(async () => {
		service = new WorkspaceMetadataFile();
		testWorkspacePath = join(process.cwd(), 'temp-test-workspace-' + Date.now());
		await mkdir(testWorkspacePath, { recursive: true });
	});

	afterEach(async () => {
		try {
			await rm(testWorkspacePath, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('read()', () => {
		it('should return null when metadata file does not exist', async () => {
			const result = await service.read(testWorkspacePath);
			expect(result).toBeNull();
		});

		it('should read existing metadata file', async () => {
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
			const metadataDir = join(testWorkspacePath, '.agent-fleet');
			await mkdir(metadataDir, { recursive: true });
			await writeFile(join(metadataDir, 'workspace-metadata.json'), 'invalid json', 'utf-8');

			const result = await service.read(testWorkspacePath);

			expect(result).toBeNull();
		});

		it('should return null for metadata file missing required fields', async () => {
			const metadataDir = join(testWorkspacePath, '.agent-fleet');
			await mkdir(metadataDir, { recursive: true });

			const invalidMetadata = {
				name: 'Test Workspace',
			};

			await writeFile(join(metadataDir, 'workspace-metadata.json'), JSON.stringify(invalidMetadata), 'utf-8');

			const result = await service.read(testWorkspacePath);

			expect(result).toBeNull();
		});
	});
});
