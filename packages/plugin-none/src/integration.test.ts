import { describe, expect, it } from 'vitest';

import { manifest } from '../plugin.config.js';

describe('plugin-none integration', () => {
	it('manifest has correct pluginId', () => {
		expect(manifest.pluginId).toBe('none');
	});

	it('manifest has manifestVersion 1', () => {
		expect(manifest.manifestVersion).toBe('1');
	});

	it('manifest declares workspace.default implementation at version 1', () => {
		expect(manifest.implementations.workspace?.default?.version).toBe(1);
	});

	it('workspace.default provider factory returns a WorkspaceProvider', () => {
		const impl = manifest.implementations.workspace?.default;
		expect(impl?.provider).toBeDefined();
		const provider = impl!.provider!({});
		expect(typeof (provider as { allocate?: unknown }).allocate).toBe('function');
		expect(typeof (provider as { release?: unknown }).release).toBe('function');
	});

	it('full allocate → release lifecycle works', async () => {
		const impl = manifest.implementations.workspace!.default!;
		const provider = impl.provider!({}) as {
			allocate: (r: unknown) => Promise<{ path: string; id: string }>;
			release: (h: unknown) => Promise<void>;
		};
		const handle = await provider.allocate({
			taskId: 'integration-test',
			executionId: 'integration-test',
			projectDir: process.cwd(),
			flow: { id: 'f', version: '1.0.0' },
		});
		expect(handle.path).toBe(process.cwd());
		expect(handle.id).toBe('none:integration-test');
		await expect(provider.release(handle)).resolves.toBeUndefined();
	});
});
