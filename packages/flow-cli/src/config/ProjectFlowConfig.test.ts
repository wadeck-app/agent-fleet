import { ConfigSchemaError, setParent } from '@wadeck-app/project-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { loadProjectConfig, projectConfigFile, validateGlobalConfigLayer } from './ProjectFlowConfig';

describe('ProjectFlowConfig', () => {
	let fixture: RegisteredProjectFixture;

	beforeEach(() => {
		fixture = new RegisteredProjectFixture();
	});

	afterEach(() => {
		fixture.dispose();
	});

	async function subject(
		name: string,
		options: { folder?: string | null } = {}
	): Promise<{ id: string; name: string; path?: string; registryDir: string }> {
		const project = await fixture.register(name, options);
		return {
			id: project.id,
			name,
			...(project.folder === undefined ? {} : { path: project.folder }),
			registryDir: fixture.registryDir,
		};
	}

	function writeProjectConfig(project: { id: string; registryDir: string }, content: string): string {
		const file = projectConfigFile(project.registryDir, project.id);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content);
		return file;
	}

	it('keeps the project config in the registry, under projects/<id>/flow/config/config.yml', async () => {
		const project = await subject('alpha');
		expect(projectConfigFile(project.registryDir, project.id)).toBe(
			path.join(project.registryDir, 'projects', project.id, 'flow', 'config', 'config.yml')
		);
	});

	it('is empty, naming no file, when the project has no config', async () => {
		expect(loadProjectConfig(await subject('alpha'))).toEqual({ values: {}, files: [] });
	});

	it('reads the hooks and plugins of the project from the registry config', async () => {
		const project = await subject('alpha');
		const file = writeProjectConfig(
			project,
			'hooks:\n  onFlowEnd:\n    - command: echo done\nplugins:\n  workspace:\n    use: worktree\n'
		);

		const loaded = loadProjectConfig(project);

		expect(loaded.files).toEqual([file]);
		expect(loaded.values['hooks']).toHaveProperty('onFlowEnd');
		expect(loaded.values['plugins']).toEqual({ workspace: { use: 'worktree' } });
	});

	it('fails loudly on a .flow/config.yml left in the repository, giving the command that moves it', async () => {
		const project = await subject('alpha');
		const legacy = path.join(project.path!, '.flow', 'config.yml');
		fs.mkdirSync(path.dirname(legacy), { recursive: true });
		fs.writeFileSync(legacy, 'hooks: {}\n');
		const target = projectConfigFile(project.registryDir, project.id);

		expect(() => loadProjectConfig(project)).toThrow(legacy);
		expect(() => loadProjectConfig(project)).toThrow(target);
		expect(() => loadProjectConfig(project)).toThrow(
			`mkdir -p "${path.dirname(target)}" && mv "${legacy}" "${target}"`
		);
		expect(() => loadProjectConfig(project)).toThrow(`alpha (${project.id})`);
	});

	it('asks to merge when both the old and the new config exist', async () => {
		const project = await subject('alpha');
		const legacy = path.join(project.path!, '.flow', 'config.yml');
		fs.mkdirSync(path.dirname(legacy), { recursive: true });
		fs.writeFileSync(legacy, 'hooks: {}\n');
		writeProjectConfig(project, 'hooks: {}\n');

		expect(() => loadProjectConfig(project)).toThrow(/both exist/i);
	});

	it('does not look for a repository config in a project that has no folder', async () => {
		const project = await subject('virtual', { folder: null });
		writeProjectConfig(project, 'hooks: {}\n');
		expect(loadProjectConfig(project).files).toHaveLength(1);
	});

	it('refuses a global-only key in the project config, naming the file, the key and where it goes', async () => {
		const project = await subject('alpha');
		const file = writeProjectConfig(project, 'worker:\n  wsPort: 4000\n');

		let failure: unknown;
		try {
			loadProjectConfig(project);
		} catch (error) {
			failure = error;
		}

		expect(failure).toBeInstanceOf(ConfigSchemaError);
		const message = (failure as ConfigSchemaError).message;
		expect(message).toContain(file);
		expect(message).toContain("'worker'");
		expect(message).toContain('global config');
		expect((failure as ConfigSchemaError).key).toBe('worker');
	});

	it('refuses an unknown key, naming the file, the key and the keys that exist', async () => {
		const project = await subject('alpha');
		const file = writeProjectConfig(project, 'hookz: {}\n');

		expect(() => loadProjectConfig(project)).toThrow(file);
		expect(() => loadProjectConfig(project)).toThrow("'hookz'");
		expect(() => loadProjectConfig(project)).toThrow(/hooks, .*plugins/);
	});

	it('refuses an unknown plugin feature, and the global plugin instances, in the project config', async () => {
		const project = await subject('alpha');
		const file = writeProjectConfig(project, 'plugins:\n  workspce:\n    use: worktree\n');
		expect(() => loadProjectConfig(project)).toThrow(`${file}': key 'plugins.workspce'`);

		writeProjectConfig(project, 'plugins:\n  instances:\n    x:\n      type: a.b\n');
		expect(() => loadProjectConfig(project)).toThrow("'plugins.instances'");
	});

	it('does not inherit the plugins or hooks of a parent project', async () => {
		const parent = await subject('parent');
		const child = await subject('child');
		await setParent(fixture.registryDir, child.id, parent.id);
		writeProjectConfig(parent, 'hooks:\n  onFlowEnd:\n    - command: echo parent\n');
		const own = writeProjectConfig(child, 'plugins:\n  workspace:\n    use: worktree\n');

		const loaded = loadProjectConfig(child);

		expect(loaded.values).toEqual({ plugins: { workspace: { use: 'worktree' } } });
		expect(loaded.files).toContain(own);
	});
});

describe('validateGlobalConfigLayer', () => {
	const file = path.join('home', '.config', 'flow', 'config.yml');

	it('accepts the keys of the daemon and the plugin instances', () => {
		expect(() =>
			validateGlobalConfigLayer(file, {
				autoUpdate: true,
				queue: { concurrency: 2 },
				plugins: { instances: { gh: { type: 'a.b' } } },
			})
		).not.toThrow();
	});

	it('refuses project-only hooks, naming the file and where they go', () => {
		expect(() => validateGlobalConfigLayer(file, { hooks: {} })).toThrow(file);
		expect(() => validateGlobalConfigLayer(file, { hooks: {} })).toThrow(/project-only.*project config/);
	});

	it('refuses a plugin feature in the global config, where only instances are declared', () => {
		expect(() => validateGlobalConfigLayer(file, { plugins: { workspace: { use: 'x' } } })).toThrow(
			"'plugins.workspace'"
		);
	});
});
