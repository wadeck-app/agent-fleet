import { Command } from 'commander';
import { DefinitionSnapshotStore, hashDefinition } from 'flow-core';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
import { registerVersionsCommand } from './VersionsCommand';

describe('VersionsCommand', () => {
	let fixture: RegisteredProjectFixture;
	let root: string;
	let configDir: string;
	let logged: string[];
	let errored: string[];

	const entry = (version: string, script = 'echo hi') => ({ version, name: 'N', steps: [{ id: 's', script }] });
	const snapshot = (version: string) => {
		const definition = { id: 'listed', ...entry(version) };
		new DefinitionSnapshotStore(path.join(configDir, 'definitions')).save({
			flowId: 'listed',
			version,
			hash: hashDefinition(definition),
			text: yaml.dump(definition),
		});
	};
	let cwd: string | undefined;
	const run = (...args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerVersionsCommand(
			program,
			() => configDir,
			() => cwd ?? root
		);
		program.parse(['node', 'test', 'versions', ...args]);
	};

	beforeEach(async () => {
		fixture = new RegisteredProjectFixture().useAsProcessEnv();
		root = (await fixture.register('versions-project')).folder!;
		configDir = path.join(fixture.root, 'config');
		fs.mkdirSync(path.join(root, '.flow'));
		logged = [];
		errored = [];
		vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => void logged.push(parts.join(' ')));
		vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => void errored.push(parts.join(' ')));
		vi.spyOn(process, 'exit').mockImplementation((() => {
			throw new Error('exit');
		}) as never);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		fixture.dispose();
	});

	it('lists the snapshotted versions and the registry version that never ran', () => {
		snapshot('1.0.0');
		fs.writeFileSync(path.join(root, '.flow', 'flows.yml'), yaml.dump({ listed: entry('1.1.0', 'new') }));

		run('listed');

		const out = logged.join('\n');
		expect(out).toMatch(/1\.0\.0\s+[0-9a-f]{12}.*snapshot/);
		expect(out).toMatch(/1\.1\.0 \*.*registry \(not run yet\)/);
	});

	it('prints JSON rows with --json', () => {
		snapshot('1.0.0');
		const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

		run('listed', '--json');

		const rows = JSON.parse(String(write.mock.calls[0]![0])) as { version: string; latest: boolean }[];
		expect(rows).toMatchObject([{ version: '1.0.0', latest: true }]);
	});

	it('exits 1 with the next step when nothing is known', () => {
		expect(() => run('ghost')).toThrow('exit');

		expect(errored.join('\n')).toContain("No version of flow 'ghost' is known");
	});

	it('refuses a flow id that cannot name a snapshot directory, with the fix', () => {
		expect(() => run('../escape')).toThrow('exit');

		expect(errored.join('\n')).toContain('cannot be versioned');
	});

	it('reads the registry of the project named with --project, whatever the working directory', async () => {
		const other = await fixture.register('other');
		fs.mkdirSync(path.join(other.folder!, '.flow'));
		fs.writeFileSync(
			path.join(other.folder!, '.flow', 'flows.yml'),
			yaml.dump({ listed: entry('2.0.0', 'other') })
		);
		cwd = fixture.makeFolder('elsewhere');

		run('listed', '--project', 'other');

		expect(logged.join('\n')).toMatch(/2\.0\.0 \*.*registry \(not run yet\)/);
	});

	it('follows FLOW_PROJECT like --project', async () => {
		const other = await fixture.register('other');
		fs.mkdirSync(path.join(other.folder!, '.flow'));
		fs.writeFileSync(path.join(other.folder!, '.flow', 'flows.yml'), yaml.dump({ listed: entry('3.0.0', 'env') }));
		cwd = fixture.makeFolder('elsewhere');
		vi.stubEnv('FLOW_PROJECT', 'other');

		run('listed');

		expect(logged.join('\n')).toMatch(/3\.0\.0 \*.*registry \(not run yet\)/);
	});

	it('refuses a project reference that does not resolve, naming the flag', () => {
		expect(() => run('listed', '-p', 'nope')).toThrow('exit');

		expect(errored.join('\n')).toContain('--project "nope"');
	});

	it('lists the snapshots alone, and says why the registry is skipped, when the working directory is in no project', () => {
		snapshot('1.0.0');
		cwd = fixture.makeFolder('unregistered');

		run('listed');

		expect(logged.join('\n')).toMatch(/1\.0\.0 \*\s+[0-9a-f]{12}.*snapshot/);
		expect(errored.join('\n')).toContain('registry of the project was not read');
		expect(errored.join('\n')).toContain(`project add "${cwd}"`);
	});
});
