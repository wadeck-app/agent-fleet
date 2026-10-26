import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectConfigFile } from '../config/ProjectFlowConfig';
import { RegisteredProjectFixture } from '../test-utils/RegisteredProjectFixture';
import { loadFlowHooks } from './loadFlowHooks';

describe('loadFlowHooks', () => {
	let fixture: RegisteredProjectFixture;

	beforeEach(() => {
		fixture = new RegisteredProjectFixture();
	});

	afterEach(() => {
		fixture.dispose();
	});

	async function project(): Promise<{ id: string; name: string; path: string; registryDir: string }> {
		const registered = await fixture.register('alpha');
		return { id: registered.id, name: 'alpha', path: registered.folder!, registryDir: fixture.registryDir };
	}

	function writeConfig(subject: { id: string }, content: string): void {
		const file = projectConfigFile(fixture.registryDir, subject.id);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, content, 'utf8');
	}

	it('reads the hooks section from the flow config of the project in the registry', async () => {
		const alpha = await project();
		writeConfig(alpha, 'hooks:\n  onFlowEnd:\n    - command: echo done\n');

		expect(loadFlowHooks(alpha)).toHaveProperty('onFlowEnd');
	});

	it('returns no hooks when the project has no config file', async () => {
		expect(loadFlowHooks(await project())).toEqual({});
	});

	// The old locations are not read as hooks; the repository one is an error (see ProjectFlowConfig.test.ts).
	it('does not read the legacy .flows/config.yml', async () => {
		const alpha = await project();
		fs.mkdirSync(path.join(alpha.path, '.flows'), { recursive: true });
		fs.writeFileSync(
			path.join(alpha.path, '.flows', 'config.yml'),
			'hooks:\n  onFlowEnd:\n    - command: x\n',
			'utf8'
		);

		expect(loadFlowHooks(alpha)).toEqual({});
	});

	it('throws on malformed YAML instead of silently dropping every hook', async () => {
		const alpha = await project();
		writeConfig(alpha, 'hooks:\n  onFlowEnd: [unclosed\n');

		expect(() => loadFlowHooks(alpha)).toThrow(/Failed to parse flow config/);
	});

	it('throws on a key that is not allowed instead of running without it', async () => {
		const alpha = await project();
		writeConfig(alpha, 'hook:\n  onFlowEnd:\n    - command: echo done\n');

		expect(() => loadFlowHooks(alpha)).toThrow("'hook'");
	});
});
