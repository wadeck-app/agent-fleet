import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FIXTURE_PLUGINS_DIR } from '../../test-utils/WorkerTypeFixture';
import { registerWorkerSourceCommand } from './WorkerSourceCommand';

// The registry rules (tokens hashed, duplicate ids, liveness...) are covered by WorkerSourceRegistry.test.ts; this
// file covers what the command adds: argument parsing, the output the user reads and the exit codes. It runs against
// a real registry in a throwaway XDG_CONFIG_HOME, so the file it writes is the one `flow` would read.

describe('flow worker source command', () => {
	let xdgHome: string;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		xdgHome = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-worker-source-cmd-'));
		vi.stubEnv('XDG_CONFIG_HOME', xdgHome);
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(process, 'exit').mockImplementation(code => {
			throw new Error(`exit ${String(code)}`);
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		fs.rmSync(xdgHome, { recursive: true, force: true });
	});

	const run = (...args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerWorkerSourceCommand(program);
		program.parse(['node', 'test', 'worker', 'source', ...args]);
	};
	const runAsync = async (...args: string[]): Promise<void> => {
		const program = new Command();
		program.exitOverride();
		registerWorkerSourceCommand(program);
		await program.parseAsync(['node', 'test', 'worker', 'source', ...args]);
	};
	const printed = (): string => logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const errors = (): string => errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const registryFile = (): string => path.join(xdgHome, 'flow', 'worker-sources.json');
	const storedSources = (): Record<string, unknown>[] =>
		(JSON.parse(fs.readFileSync(registryFile(), 'utf8')) as { sources: Record<string, unknown>[] }).sources;

	describe('add', () => {
		it('declares the source, prints both tokens once and persists only hashes', () => {
			run(
				'add',
				'gpu-box',
				'--provider',
				'built-in:command',
				'--command',
				'flow',
				'--arg',
				'worker',
				'--labels',
				'gpu, linux',
				'--max-workers',
				'2'
			);
			const out = printed();
			expect(out).toContain("[ok] Declared worker source 'gpu-box'");
			expect(out).toContain('labels     : gpu, linux');
			expect(out).toContain('maxWorkers : 2');
			expect(out).toContain('command    : flow');
			expect(out).toContain('Worker token (shown once, store it now)');
			expect(out).toContain('Source token (shown once, store it now)');

			// The token is the long line printed right after its "shown once" caption.
			const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
			const captionIndex = lines.findIndex((l: string) => l.includes('Worker token (shown once'));
			const token = lines[captionIndex + 1]!.trim();
			expect(token.length).toBeGreaterThan(20);
			expect(fs.readFileSync(registryFile(), 'utf8')).not.toContain(token);
			expect(storedSources()[0]).toMatchObject({
				sourceId: 'gpu-box',
				labels: ['gpu', 'linux'],
				maxWorkers: 2,
				options: { command: 'flow', args: ['worker'] },
			});
		});

		it('stores no options key when no launch detail was given', () => {
			run('add', 'inbound-1', '--provider', 'built-in:inbound');
			expect(storedSources()[0]).not.toHaveProperty('options');
		});

		it('fails with the offending value for a --max-workers that is not a positive integer', () => {
			expect(() => run('add', 'x', '--provider', 'built-in:inbound', '--max-workers', '0')).toThrow('exit 1');
			expect(errors()).toContain('[fail] --max-workers must be a positive integer, got "0"');
			expect(fs.existsSync(registryFile())).toBe(false);
		});

		it('fails with the registry message when the id is already declared', () => {
			run('add', 'dup', '--provider', 'built-in:inbound');
			errorSpy.mockClear();
			expect(() => run('add', 'dup', '--provider', 'built-in:inbound')).toThrow('exit 1');
			expect(errors()).toMatch(/^\[fail\] .*dup/);
		});
	});

	describe('list', () => {
		it('points at the add command when nothing is declared', async () => {
			await runAsync('list');
			expect(printed()).toContain('No worker sources declared. Add one with: flow worker source add');
		});

		it('prints one tab-separated line per source and reminds that declared is not live', async () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound', '--labels', 'gpu');
			logSpy.mockClear();
			await runAsync('list');
			expect(printed()).toContain('gpu-box\tbuilt-in:inbound\tmax=1\tlabels=gpu');
			expect(printed()).toContain('Use "flow worker list" to see live workers.');
		});

		it('shows the plugin of a plugin source', async () => {
			run(
				'add',
				'sandbox',
				'--provider',
				'docker-sandbox',
				'--plugin',
				'sandbox.docker',
				'--plugins-dir',
				path.join(xdgHome, 'plugins')
			);
			logSpy.mockClear();
			await runAsync('list');
			expect(printed()).toContain('sandbox	docker-sandbox	max=1	labels=(none)	plugin=sandbox.docker');
		});

		it('--json prints the entries', async () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound');
			logSpy.mockClear();
			await runAsync('list', '--json');
			expect(JSON.parse(printed())).toEqual([expect.objectContaining({ sourceId: 'gpu-box' })]);
		});

		it('--validate adds the liveness of each entry and explains the values', async () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound');
			logSpy.mockClear();
			await runAsync('list', '--validate');
			expect(printed()).toMatch(/gpu-box\t.*\tliveness=\w+/);
			expect(printed()).toContain('liveness=dead means');
		});
	});

	// The requirement messages tell the user to run `flow worker source list`: it has to show what each source guarantees.
	describe('list - guarantees declared by the plugin manifest', () => {
		const declare = (sourceId: string, implementation: string): void => {
			run(
				'add',
				sourceId,
				'--provider',
				'fixture',
				'--plugin',
				`fixture-sandbox.${implementation}`,
				'--plugins-dir',
				FIXTURE_PLUGINS_DIR
			);
		};

		it('prints the guarantees of a plugin source and marks it requirement-only', async () => {
			declare('sbx', 'confined');
			logSpy.mockClear();

			await runAsync('list');

			expect(printed()).toMatch(/^sbx\t.*\tguarantees=env=clean, fs=confined, sandbox\trequirement-only$/m);
			expect(printed()).toContain(
				'requirement-only: a step is routed to it only when it requires something it guarantees'
			);
		});

		it('prints guarantees=(none) for a plugin that declares none, with no requirement-only mark', async () => {
			declare('plain', 'sandbox');
			logSpy.mockClear();

			await runAsync('list');

			expect(printed()).toMatch(/^plain\t.*\tguarantees=\(none\)$/m);
		});

		it('prints the workspace kinds a source accepts when its manifest declares them', async () => {
			declare('pooled', 'poolonly');
			logSpy.mockClear();

			await runAsync('list');

			expect(printed()).toMatch(/^pooled\t.*\tguarantees=sandbox\tworkspaces=pool\trequirement-only$/m);
		});

		it('prints nothing about guarantees for a source that has no plugin', async () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound');
			logSpy.mockClear();

			await runAsync('list');

			expect(printed()).not.toContain('guarantees=');
		});

		it('says on stderr, with the fix, that a manifest cannot be read, and prints guarantees=(unreadable) without exiting', async () => {
			declare('bad', 'badmanifestguarantees');
			logSpy.mockClear();

			await runAsync('list');

			expect(printed()).toMatch(/^bad\t.*\tguarantees=\(unreadable\)$/m);
			expect(errors()).toContain('bad');
			expect(errors()).toMatch(/Fix|fix/);
		});

		it('--json adds guarantees (and workspaces when declared, and requirementOnly) to each entry', async () => {
			declare('sbx', 'confined');
			declare('pooled', 'poolonly');
			declare('plain', 'sandbox');
			run('add', 'gpu-box', '--provider', 'built-in:inbound');
			declare('bad', 'badmanifestguarantees');
			logSpy.mockClear();

			await runAsync('list', '--json');

			const listed = JSON.parse(printed()) as Record<string, unknown>[];
			const byId = Object.fromEntries(listed.map(entry => [entry.sourceId as string, entry]));
			expect(byId.sbx).toMatchObject({
				guarantees: ['env=clean', 'fs=confined', 'sandbox'],
				requirementOnly: true,
			});
			expect(byId.sbx).not.toHaveProperty('workspaces');
			expect(byId.pooled).toMatchObject({ guarantees: ['sandbox'], workspaces: ['pool'], requirementOnly: true });
			expect(byId.plain).toMatchObject({ guarantees: [], requirementOnly: false });
			expect(byId['gpu-box']).toMatchObject({ guarantees: [], requirementOnly: false });
			// null, not []: an unreadable manifest must not look like a plugin that guarantees nothing
			expect(byId.bad).toMatchObject({ guarantees: null, requirementOnly: false });
		});

		it('--json keeps stdout parseable: the unreadable-manifest message goes to stderr', async () => {
			declare('bad', 'badmanifestguarantees');
			logSpy.mockClear();

			await runAsync('list', '--json');

			expect(() => JSON.parse(printed())).not.toThrow();
			expect(errors()).toContain('bad');
		});
	});

	describe('list --json - stored URLs are redacted', () => {
		it('prints scheme, host and path of nudgeUrl and options.nudgeUrl, with no user info and no query values', async () => {
			fs.mkdirSync(path.dirname(registryFile()), { recursive: true });
			fs.writeFileSync(
				registryFile(),
				JSON.stringify({
					sources: [
						{
							sourceId: 'old-terminal',
							provider: 'built-in:inbound',
							labels: [],
							maxWorkers: 1,
							nudgeUrl: 'http://user:pw@127.0.0.1:5555/nudge?token=abc123',
							options: { nudgeUrl: 'http:u:p2@127.0.0.1:6666/x?key=zzz', projects: ['C:/proj'] },
							tokenHash: 'h',
							createdAt: '2026-01-01T00:00:00.000Z',
						},
					],
				}),
				'utf8'
			);

			await runAsync('list', '--json');

			const out = printed();
			const [listed] = JSON.parse(out) as { nudgeUrl: string; options: Record<string, unknown> }[];
			expect(listed!.nudgeUrl).toBe('http://127.0.0.1:5555/nudge?…');
			expect(listed!.options).toEqual({ nudgeUrl: 'http://127.0.0.1:6666/x?…', projects: ['C:/proj'] });
			for (const secret of ['pw', 'abc123', 'p2', 'zzz']) {
				expect(out).not.toContain(secret);
			}
		});
	});

	describe('add - a plugin source', () => {
		const pluginsDir = (): string => path.join(xdgHome, 'plugins');

		it('stores the plugin ref, the plugins directory and the --option values', async () => {
			await runAsync(
				'add',
				'sandbox',
				'--provider',
				'docker-sandbox',
				'--plugin',
				'sandbox.docker',
				'--plugins-dir',
				pluginsDir(),
				'--option',
				'image=node:22',
				'--option',
				'flags=a=b'
			);
			expect(storedSources()[0]).toMatchObject({
				plugin: 'sandbox.docker',
				pluginsDir: pluginsDir(),
				options: { image: 'node:22', flags: 'a=b' },
			});
			expect(printed()).toContain('plugin     : sandbox.docker');
		});

		it('declares the command worker type as a plugin with no --plugins-dir: no warning, no directory stored', () => {
			run('add', 'laptop', '--provider', 'command', '--plugin', 'command.default', '--command', 'flow');

			expect(printed()).toContain('plugin     : command.default (built-in)');
			expect(printed()).not.toContain('[warn]');
			expect(storedSources()[0]).toMatchObject({ plugin: 'command.default', options: { command: 'flow' } });
			expect(storedSources()[0]).not.toHaveProperty('pluginsDir');
		});

		it('refuses to declare fork, exits 1 and says what to declare instead', () => {
			expect(() => run('add', 'forked', '--provider', 'fork', '--plugin', 'fork.default')).toThrow('exit 1');

			expect(errors()).toContain(
				'fork is the daemon\'s own fallback and cannot be declared as a source. The daemon forks a worker itself when a step has nobody to run it. To add capacity, declare a built-in:command source that launches "flow worker", or a built-in:inbound source for a worker you start yourself.'
			);
			expect(fs.existsSync(registryFile())).toBe(false);
		});

		it('refuses --provider built-in:fork too, at the command', () => {
			expect(() => run('add', 'forked', '--provider', 'built-in:fork')).toThrow('exit 1');

			expect(errors()).toContain(
				'Worker source "forked": fork is the daemon\'s own fallback and cannot be declared as a source.'
			);
			expect(fs.existsSync(registryFile())).toBe(false);
		});

		it('declares a built-in plugin ref with no --plugins-dir: no warning, no directory stored', () => {
			run('add', 'build-box', '--provider', 'relay', '--plugin', 'relay.default');

			expect(printed()).toContain('plugin     : relay.default (built-in)');
			expect(printed()).not.toContain('[warn]');
			expect(printed()).not.toContain('undefined');
			expect(storedSources()[0]).toMatchObject({ plugin: 'relay.default' });
			expect(storedSources()[0]).not.toHaveProperty('pluginsDir');
		});

		it('help describes --plugins-dir as needed only for plugins that are not built-in', () => {
			const program = new Command();
			registerWorkerSourceCommand(program);
			const add = program.commands
				.find(c => c.name() === 'worker')
				?.commands.find(c => c.name() === 'source')
				?.commands.find(c => c.name() === 'add');
			const help = (add?.helpInformation() ?? '').replace(/\s+/g, ' ');

			expect(help).toContain('not needed for a built-in plugin such as relay.default');
		});

		it('warns, and still declares, when the plugin is a built-in so the --plugins-dir is ignored', () => {
			run('add', 'build-box', '--provider', 'relay', '--plugin', 'relay.default', '--plugins-dir', pluginsDir());

			expect(printed()).toContain(
				`[warn] Worker source "build-box": plugin "relay.default" is a built-in worker type of flow, so the daemon serves it from the built-in registry and ignores the pluginsDir "${pluginsDir()}".`
			);
			expect(storedSources()).toHaveLength(1);
		});

		it('exits 1 with the fix when --plugin has no --plugins-dir', () => {
			expect(() => run('add', 'sandbox', '--provider', 'docker-sandbox', '--plugin', 'sandbox.docker')).toThrow(
				'exit 1'
			);
			expect(errors()).toContain('--plugins-dir');
		});

		it('exits 1 on an --option without "="', () => {
			expect(() =>
				run(
					'add',
					'sandbox',
					'--provider',
					'docker-sandbox',
					'--plugin',
					'sandbox.docker',
					'--plugins-dir',
					pluginsDir(),
					'--option',
					'oops'
				)
			).toThrow('exit 1');
			expect(errors()).toContain('--option must be key=value');
		});

		it('says on remove that a running daemon disposes the plugin instance later', () => {
			run(
				'add',
				'sandbox',
				'--provider',
				'docker-sandbox',
				'--plugin',
				'sandbox.docker',
				'--plugins-dir',
				pluginsDir()
			);
			logSpy.mockClear();
			run('remove', 'sandbox');
			expect(printed()).toContain('at its next daemon contact or stop');
		});
	});

	// The option names a plugin manifest declares (`options`) are checked when the source is declared: a misspelt `projects`
	// would otherwise be stored and read by the core as a source that serves every project.
	describe('add - option names declared by the plugin manifest', () => {
		const addScoped = (implementation: string, ...options: string[]): Promise<void> =>
			runAsync(
				'add',
				'sbx',
				'--provider',
				'fixture',
				'--plugin',
				`fixture-sandbox.${implementation}`,
				'--plugins-dir',
				FIXTURE_PLUGINS_DIR,
				...options.flatMap(option => ['--option', option])
			);

		it('refuses an unknown option name: names it, lists the accepted ones, suggests the nearest, stores nothing', async () => {
			await expect(addScoped('scoped', 'project=a')).rejects.toThrow('exit 1');

			expect(errors()).toMatch(/^\[fail\] /m);
			expect(errors()).toContain('option "project"');
			expect(errors()).toContain('Did you mean "projects"?');
			expect(errors()).toContain('Accepted options: image, projects, region.');
			expect(errors()).toContain('fixture-sandbox.scoped');
			expect(fs.existsSync(registryFile())).toBe(false);
		});

		it('accepts the declared names', async () => {
			await addScoped('scoped', 'projects=a,b', 'image=x');

			expect(storedSources()[0]).toMatchObject({ options: { projects: 'a,b', image: 'x' } });
			expect(errors()).toBe('');
		});

		it('refuses every option when the manifest declares an empty list', async () => {
			await expect(addScoped('nooptions', 'projects=a')).rejects.toThrow('exit 1');

			expect(errors()).toContain('Accepted options: none.');
		});

		it('checks nothing when the manifest declares no options (older plugins)', async () => {
			await addScoped('confined', 'whatever=a');

			expect(storedSources()[0]).toMatchObject({ options: { whatever: 'a' } });
		});

		it('declares the source and warns, naming the reason, when the manifest cannot be read to check the names', async () => {
			await addScoped('badmanifestoptions', 'projects=a');

			expect(storedSources()).toHaveLength(1);
			expect(printed()).toContain('[warn]');
			expect(printed()).toContain('option names could not be checked');
		});
	});

	describe('list - option names the manifest does not declare', () => {
		it('prints one warning line on stderr naming the option and the nearest one, and still lists the source', async () => {
			// declared before the manifest's option list existed, or by editing the registry by hand
			fs.mkdirSync(path.dirname(registryFile()), { recursive: true });
			fs.writeFileSync(
				registryFile(),
				JSON.stringify({
					sources: [
						{
							sourceId: 'sbx',
							provider: 'fixture',
							labels: [],
							maxWorkers: 1,
							plugin: 'fixture-sandbox.scoped',
							pluginsDir: FIXTURE_PLUGINS_DIR,
							options: { project: 'a' },
							tokenHash: 'h',
							createdAt: '2026-11-14T00:00:00.000Z',
						},
					],
				})
			);

			await runAsync('list');

			const warnings = errors()
				.split('\n')
				.filter(line => line.includes('option "project"'));
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('[warn]');
			expect(warnings[0]).toContain('Did you mean "projects"?');
			expect(printed()).toMatch(/^sbx\t/m);
		});
	});

	describe('remove', () => {
		it('removes a declared source', () => {
			run('add', 'gpu-box', '--provider', 'built-in:inbound');
			logSpy.mockClear();
			run('remove', 'gpu-box');
			expect(printed()).toContain("[ok] Removed worker source 'gpu-box'");
			expect(storedSources()).toEqual([]);
		});

		it('exits 1 naming the id when it is not declared', () => {
			expect(() => run('remove', 'ghost')).toThrow('exit 1');
			expect(errors()).toContain("[fail] No worker source declared with id 'ghost'");
		});
	});

	describe('prune and repair', () => {
		it('prune reports that no dead source was found', () => {
			run('prune');
			expect(printed()).toContain('[ok] No dead worker sources found.');
		});

		it('repair leaves a healthy registry alone', () => {
			run('repair');
			expect(printed()).toContain('nothing to repair');
		});

		it('repair backs up a registry that does not parse and says how to continue', () => {
			fs.mkdirSync(path.dirname(registryFile()), { recursive: true });
			fs.writeFileSync(registryFile(), '{ broken');
			run('repair');
			expect(printed()).toContain('Worker source registry was corrupt -- backed up to');
			expect(printed()).toContain('Re-declare any sources you need');
		});

		it('a corrupt registry makes list fail with an exit code instead of a stack trace', async () => {
			fs.mkdirSync(path.dirname(registryFile()), { recursive: true });
			fs.writeFileSync(registryFile(), '{ broken');
			await expect(runAsync('list')).rejects.toThrow('exit 1');
			expect(errors()).toMatch(/^\[fail\] /);
		});
	});

	it('returns the worker command group so `flow worker start` can be attached to it', () => {
		const program = new Command();
		const worker = registerWorkerSourceCommand(program);
		expect(worker.name()).toBe('worker');
	});
});
