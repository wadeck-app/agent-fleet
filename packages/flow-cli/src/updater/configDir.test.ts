import * as os from 'node:os';
import * as path from 'node:path';

import { getConfigDir } from './configDir';

describe('getConfigDir', () => {
	const originalPlatform = process.platform;

	function setPlatform(p: string): void {
		Object.defineProperty(process, 'platform', { value: p, configurable: true });
	}

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
	});

	it('returns ~/.config/flow on Linux/macOS when HOME is set and XDG_CONFIG_HOME is not', () => {
		setPlatform('linux');
		vi.stubEnv('XDG_CONFIG_HOME', '');
		vi.stubEnv('HOME', '/home/testuser');

		expect(getConfigDir()).toBe(path.join('/home/testuser', '.config', 'flow'));
	});

	it('returns XDG_CONFIG_HOME/flow when XDG_CONFIG_HOME is set (takes precedence)', () => {
		setPlatform('linux');
		vi.stubEnv('XDG_CONFIG_HOME', '/custom/config');
		vi.stubEnv('HOME', '/home/testuser');

		expect(getConfigDir()).toBe(path.join('/custom/config', 'flow'));
	});

	it('returns APPDATA/flow on Windows when process.platform is win32 and APPDATA is set', () => {
		setPlatform('win32');
		vi.stubEnv('XDG_CONFIG_HOME', '');
		vi.stubEnv('APPDATA', 'C:\\Users\\testuser\\AppData\\Roaming');

		expect(getConfigDir()).toBe(path.join('C:\\Users\\testuser\\AppData\\Roaming', 'flow'));
	});

	it('falls back to os.homedir()/.config/flow when HOME env var is not set', () => {
		setPlatform('linux');
		vi.stubEnv('XDG_CONFIG_HOME', '');
		// Cannot spy on os.homedir in ESM -- use the real value and verify the path suffix.
		const originalHome = process.env['HOME'];
		delete process.env['HOME'];

		try {
			const result = getConfigDir();
			// os.homedir() always returns something; result must end with .config/flow or \flow
			expect(result).toMatch(/[/\\]\.config[/\\]flow$/);
		} finally {
			if (originalHome !== undefined) {
				process.env['HOME'] = originalHome;
			}
		}
	});
});
