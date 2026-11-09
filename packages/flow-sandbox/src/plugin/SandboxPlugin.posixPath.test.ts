import * as nodePath from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The plugin reads `node:path` for its host: on a POSIX host `\\server\share\sbx.exe` is NOT an absolute path, so the check for a network path must not
 * depend on `isAbsolute`. This test loads the plugin with `node:path` replaced by its POSIX flavour, so the POSIX behaviour is checked on any machine
 * (a Windows host included). Same file as the daemon loads, imported by URL.
 */
const PLUGIN_FILE = fileURLToPath(new URL('../../plugin/plugin.config.js', import.meta.url));

interface PluginModule {
	internals: { parseOptions: (options: Record<string, string>) => unknown };
}

const GOOD = { projects: 'ab12cd34', region: 'us-east-1', profiles: 'claude=my-sso-profile' };

async function loadWithPosixPath(): Promise<PluginModule> {
	vi.resetModules();
	vi.doMock('node:path', () => ({
		...nodePath.posix,
		default: nodePath.posix,
		posix: nodePath.posix,
		win32: nodePath.win32,
	}));
	return (await import(`${pathToFileURL(PLUGIN_FILE).href}?posix=${Date.now()}`)) as PluginModule;
}

afterEach(() => {
	vi.doUnmock('node:path');
	vi.resetModules();
});

describe('sandbox plugin sbxPath validation with the POSIX flavour of node:path', () => {
	function messageFor(plugin: PluginModule, sbxPath: string): string {
		try {
			plugin.internals.parseOptions({ ...GOOD, sbxPath });
		} catch (error) {
			return (error as Error).message;
		}
		return '';
	}

	it.each([
		['a Windows network share', '\\\\server\\share\\sbx.exe'],
		['a POSIX-style network path', '//server/share/sbx'],
	])('says "network path" for %s, not "absolute path"', async (_name, sbxPath) => {
		const plugin = await loadWithPosixPath();

		const message = messageFor(plugin, sbxPath);

		expect(message).toContain('network path');
		expect(message).toContain('sbxPath=');
	});

	it('still refuses a relative path as not absolute', async () => {
		const plugin = await loadWithPosixPath();

		expect(messageFor(plugin, 'bin/sbx')).toContain('absolute');
	});
});
