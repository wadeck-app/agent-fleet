import * as fs from 'node:fs';
import * as path from 'node:path';

import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { launchProjectConfig } from './LaunchProjectConfig';
import { projectConfigFile } from './ProjectFlowConfig';

describe('launchProjectConfig', () => {
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

	function writeRegistryConfig(projectId: string, content: string): string {
		const file = projectConfigFile(fixture.registryDir, projectId);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
		return file;
	}

	it('is the registry config of the registered project that contains the launch folder', async () => {
		const alpha = await fixture.register('alpha');
		const sub = path.join(alpha.folder!, 'sub');
		fs.mkdirSync(sub);
		const file = writeRegistryConfig(alpha.id, 'plugins:\n  workspace:\n    use: worktree\n');

		const result = launchProjectConfig(sub, fixture.env());

		expect(result).toEqual({ values: { plugins: { workspace: { use: 'worktree' } } }, files: [file] });
	});

	it('follows FLOW_PROJECT, like every other flow command', async () => {
		const alpha = await fixture.register('alpha');
		const elsewhere = fixture.makeFolder('elsewhere');
		writeRegistryConfig(alpha.id, 'hooks: {}\n');

		const result = launchProjectConfig(elsewhere, fixture.env({ FLOW_PROJECT: 'alpha' }));

		expect(result?.values).toEqual({ hooks: {} });
	});

	it('is empty for a registered project that has no config yet', async () => {
		const alpha = await fixture.register('alpha');

		expect(launchProjectConfig(alpha.folder!, fixture.env())).toEqual({ values: {}, files: [] });
	});

	it('fails with the command that moves a .flow/config.yml left in the repository of the project', async () => {
		const alpha = await fixture.register('alpha');
		const legacy = writeConfig(alpha.folder!, 'plugins:\n  workspace:\n    use: worktree\n');

		expect(() => launchProjectConfig(alpha.folder!, fixture.env())).toThrow(legacy);
		expect(() => launchProjectConfig(alpha.folder!, fixture.env())).toThrow(
			projectConfigFile(fixture.registryDir, alpha.id)
		);
	});

	it('is null, with the reason on stderr, when the launch folder is in no project and has no project config', () => {
		const unregistered = fixture.makeFolder('unregistered');

		const result = launchProjectConfig(unregistered, fixture.env());

		expect(result).toBeNull();
		expect(stderr.join('')).toContain('No project plugin config loaded');
		expect(stderr.join('')).toContain(unregistered);
	});

	it('is null when the unregistered folder has a .flow/config.yml that declares no plugins (only hooks)', () => {
		const unregistered = fixture.makeFolder('hooks-only');
		writeConfig(unregistered, 'hooks:\n  onFlowEnd:\n    - command: echo done\n');

		expect(launchProjectConfig(unregistered, fixture.env())).toBeNull();
	});

	it('fails loudly when the unregistered folder has a .flow/config.yml that declares plugins, instead of ignoring it', () => {
		const unregistered = fixture.makeFolder('plugins-ignored');
		const file = writeConfig(unregistered, 'plugins:\n  workspace:\n    use: worktree\n');

		expect(() => launchProjectConfig(unregistered, fixture.env())).toThrow(file);
		expect(() => launchProjectConfig(unregistered, fixture.env())).toThrow(`project add "${unregistered}"`);
		expect(() => launchProjectConfig(unregistered, fixture.env())).toThrow(
			'moves the file into the project registry'
		);
	});

	it('reports a bad FLOW_PROJECT on stderr and loads no project config', () => {
		const unregistered = fixture.makeFolder('bad-ref');

		const result = launchProjectConfig(unregistered, fixture.env({ FLOW_PROJECT: 'nope' }));

		expect(result).toBeNull();
		expect(stderr.join('')).toContain('FLOW_PROJECT="nope"');
	});
});
