import { Command } from 'commander';
import { DefinitionSnapshotStore, hashDefinition } from 'flow-core';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { registerVersionsCommand } from './VersionsCommand';

describe('VersionsCommand', () => {
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
	const run = (...args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerVersionsCommand(
			program,
			() => configDir,
			() => root
		);
		program.parse(['node', 'test', 'versions', ...args]);
	};

	beforeEach(() => {
		root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'versions-cmd-')));
		configDir = path.join(root, 'config');
		fs.mkdirSync(path.join(root, '.flow'));
		fs.writeFileSync(path.join(root, '.flow', 'config.yml'), '');
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
		fs.rmSync(root, { recursive: true, force: true });
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
});
