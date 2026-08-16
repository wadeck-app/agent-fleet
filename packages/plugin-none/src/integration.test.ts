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
			allocate: (r: { taskId: string }) => Promise<{ path: string; id: string }>;
			release: (h: unknown) => Promise<void>;
		};
		const handle = await provider.allocate({ taskId: 'integration-test' });
		expect(handle.path).toBe(process.cwd());
		expect(handle.id).toBe('none:integration-test');
		await expect(provider.release(handle)).resolves.toBeUndefined();
	});
});
