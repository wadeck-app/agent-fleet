import * as fs from 'node:fs';
import * as path from 'node:path';

import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { launchProjectConfigPath } from './LaunchProjectConfig';

describe('launchProjectConfigPath', () => {
	let fixture: RegisteredProjectFixture;
	let stderr: string[];

	beforeEach(() => {
		fixture = new RegisteredProjectFixture();
		stderr = [];
		vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
			stderr.push(String(chunk));
			return true;
		});
	});

	afterEach(() => {
		fixture.dispose();
	});

	function writeConfig(folder: string, content: string): string {
		const file = path.join(folder, '.flow', 'config.yml');
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
		return file;
	}

	it('is the .flow/config.yml of the registered project that contains the launch folder', async () => {
		const alpha = await fixture.register('alpha');
		const sub = path.join(alpha.folder!, 'sub');
		fs.mkdirSync(sub);

		const result = launchProjectConfigPath(sub, fixture.env());

		expect(result).toBe(path.join(alpha.folder!, '.flow', 'config.yml'));
	});

	it('follows FLOW_PROJECT, like every other flow command', async () => {
		const alpha = await fixture.register('alpha');
		const elsewhere = fixture.makeFolder('elsewhere');

		const result = launchProjectConfigPath(elsewhere, fixture.env({ FLOW_PROJECT: 'alpha' }));

		expect(result).toBe(path.join(alpha.folder!, '.flow', 'config.yml'));
	});

	it('is null, with the reason on stderr, when the launch folder is in no project and has no project config', () => {
		const unregistered = fixture.makeFolder('unregistered');

		const result = launchProjectConfigPath(unregistered, fixture.env());

		expect(result).toBeNull();
		expect(stderr.join('')).toContain('No project plugin config loaded');
		expect(stderr.join('')).toContain(unregistered);
	});

	it('is null when the unregistered folder has a .flow/config.yml that declares no plugins (only hooks)', () => {
		const unregistered = fixture.makeFolder('hooks-only');
		writeConfig(unregistered, 'hooks:\n  onFlowEnd:\n    - command: echo done\n');

		expect(launchProjectConfigPath(unregistered, fixture.env())).toBeNull();
	});

	it('fails loudly when the unregistered folder has a .flow/config.yml that declares plugins, instead of ignoring it', () => {
		const unregistered = fixture.makeFolder('plugins-ignored');
		const file = writeConfig(unregistered, 'plugins:\n  workspace:\n    use: worktree\n');

		expect(() => launchProjectConfigPath(unregistered, fixture.env())).toThrow(file);
		expect(() => launchProjectConfigPath(unregistered, fixture.env())).toThrow(`project add "${unregistered}"`);
	});

	it('reports a bad FLOW_PROJECT on stderr and loads no project config', () => {
		const unregistered = fixture.makeFolder('bad-ref');

		const result = launchProjectConfigPath(unregistered, fixture.env({ FLOW_PROJECT: 'nope' }));

		expect(result).toBeNull();
		expect(stderr.join('')).toContain('FLOW_PROJECT="nope"');
	});
});
