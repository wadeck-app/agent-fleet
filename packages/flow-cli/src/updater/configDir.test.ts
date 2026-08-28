import { ConfigDir } from '@wadeck-app/shared-cli/ConfigDir';
import * as os from 'node:os';
import * as path from 'node:path';

describe('ConfigDir.get', () => {
	const originalPlatform = process.platform;

	function setPlatform(p: string): void {
		Object.defineProperty(process, 'platform', { value: p, configurable: true });
	}

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
	});

	it('returns ~/.config/flow on Linux/macOS when XDG_CONFIG_HOME is not set', () => {
		setPlatform('linux');
		vi.stubEnv('XDG_CONFIG_HOME', '');

		const result = ConfigDir.get('flow');
		// os.homedir() always returns something; verify the path uses .config/flow
		expect(result).toMatch(/[/\\]\.config[/\\]flow$/);
	});

	it('returns XDG_CONFIG_HOME/flow when XDG_CONFIG_HOME is set (takes precedence)', () => {
		setPlatform('linux');
		vi.stubEnv('XDG_CONFIG_HOME', '/custom/config');

		expect(ConfigDir.get('flow')).toBe(path.join('/custom/config', 'flow'));
	});

	it('returns ~/.config/flow on Windows (no APPDATA branch anymore)', () => {
		setPlatform('win32');
		vi.stubEnv('XDG_CONFIG_HOME', '');

		const result = ConfigDir.get('flow');
		// Windows uses os.homedir()/.config/flow just like other platforms
		expect(result).toMatch(/[/\\]\.config[/\\]flow$/);
	});

	it('falls back to os.homedir()/.config/flow when HOME env var is not set', () => {
		setPlatform('linux');
		vi.stubEnv('XDG_CONFIG_HOME', '');
		// Cannot spy on os.homedir in ESM -- use the real value and verify the path suffix.
		const originalHome = process.env['HOME'];
		delete process.env['HOME'];

		try {
			const result = ConfigDir.get('flow');
			// os.homedir() always returns something; result must end with .config/flow or \flow
			expect(result).toMatch(/[/\\]\.config[/\\]flow$/);
		} finally {
			if (originalHome !== undefined) {
				process.env['HOME'] = originalHome;
			}
		}
	});
});
