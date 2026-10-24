import { Command } from 'commander';
import { DefinitionSnapshotStore, hashDefinition } from 'flow-core';
import { SECRET_EXAMPLE_FLOW_YAML } from 'flow-engine/secrets/SecretFlowExample';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { registerShowCommand } from './ShowCommand';

const FIXTURES_DIR = path.resolve(__dirname, '../../test-utils/fixtures');
const SIMPLE_FLOW = path.join(FIXTURES_DIR, 'simple-flow.yml');

describe('ShowCommand', () => {
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('exit');
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const runShow = (file: string, ...extra: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerShowCommand(program, () => FIXTURES_DIR);
		program.parse(['node', 'test', 'show', file, ...extra]);
	};

	const logged = (): string => consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const errored = (): string =>
		(console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(c => c.join(' ')).join('\n');

	describe('execution id', () => {
		it('shows an execution by full id', () => {
			runShow('f41lc0de');
			expect(logged()).toContain('Execution: f41lc0de');
			expect(logged()).toContain('validate_type  [failed]');
		});

		it('shows an execution by unique prefix', () => {
			runShow('f41');
			expect(logged()).toContain('Execution: f41lc0de');
		});

		it('truncates failed output with --tail and not with --full', () => {
			runShow('f41lc0de', '--tail', '13');
			expect(logged()).not.toContain('START-OF-STDOUT');
			expect(logged()).toMatch(/more chars, see .*f41lc0de\.json/);
			consoleSpy.mockClear();
			runShow('f41lc0de', '--full');
			expect(logged()).toContain('START-OF-STDOUT');
		});

		it('rejects an invalid --tail value', () => {
			expect(() => runShow('f41lc0de', '--tail', 'abc')).toThrow('exit');
			expect(errored()).toContain('Invalid --tail');
		});

		it('--json prints the raw record', () => {
			const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
			runShow('f41lc0de', '--json');
			const parsed = JSON.parse(String(write.mock.calls[0][0]));
			expect(parsed.executionId).toBe('f41lc0de');
			expect(parsed.steps.validate_type.stdout).toContain('START-OF-STDOUT');
		});

		it('unknown id exits with an actionable error', () => {
			expect(() => runShow('zzzzzzzz')).toThrow('exit');
			expect(errored()).toContain("No execution matches 'zzzzzzzz'");
			expect(errored()).toContain('also not an existing flow file');
			expect(errored()).toContain('flow history');
		});

		it('an existing file wins over an execution id of the same name', () => {
			const cwd = process.cwd();
			process.chdir(FIXTURES_DIR);
			try {
				// "simple-flow.yml" is a file; no execution id interpretation is attempted.
				runShow('simple-flow.yml');
			} finally {
				process.chdir(cwd);
			}
			expect(logged()).toContain('simple-flow');
		});

		it('names both interpretations when the target is neither a file nor an id', () => {
			expect(() => runShow('missing/flow.yml')).toThrow('exit');
			expect(errored()).toContain('As a file');
			expect(errored()).toContain('As an execution');
			expect(errored()).toContain('flow history');
		});
	});

	it('renders table for valid flow (console.log called, output contains flow id)', () => {
		runShow(SIMPLE_FLOW);

		expect(consoleSpy).toHaveBeenCalled();
		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('simple-flow');
	});

	it('output contains all step IDs', () => {
		runShow(SIMPLE_FLOW);

		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('step-one');
		expect(allOutput).toContain('step-two');
		expect(allOutput).toContain('step-approve');
	});

	it('user_intervention step shows (!) marker for blocking step', () => {
		runShow(SIMPLE_FLOW);

		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('step-approve (!)');
	});

	it('output contains script type for step-one', () => {
		runShow(SIMPLE_FLOW);

		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('script');
	});

	it('output contains haiku model name for step-two', () => {
		runShow(SIMPLE_FLOW);

		const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
		expect(allOutput).toContain('haiku');
	});
});

describe('ShowCommand: declared secrets', () => {
	it('lists the secrets of a flow file with their users and never a value', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'show-secrets-'));
		const file = path.join(dir, 'flow.yml');
		fs.writeFileSync(file, SECRET_EXAMPLE_FLOW_YAML);
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			const program = new Command();
			program.exitOverride();
			registerShowCommand(program, () => dir);
			program.parse(['node', 'test', 'show', file]);
			const out = log.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
			expect(out).toContain('secrets:');
			expect(out).toContain('API_TOKEN');
			expect(out).toContain('call-api');
		} finally {
			log.mockRestore();
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('ShowCommand: --io', () => {
	let configDir: string;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'show-io-'));
		fs.mkdirSync(path.join(configDir, 'executions'));
		const record = {
			executionId: 'i0c0ffee',
			flowFile: 'f.yml',
			flowId: 'f',
			status: 'completed',
			currentSteps: [],
			startedAt: '2026-10-24T10:00:00.000Z',
			completedAt: '2026-10-24T10:00:05.000Z',
			steps: {
				recorded: {
					status: 'completed',
					startedAt: '2026-10-24T10:00:00.000Z',
					completedAt: '2026-10-24T10:00:01.000Z',
					io: {
						inputs: { 'env.REGION': { text: 'eu', truncated: false, chars: 2 } },
						outputs: { plan: { text: 'abcd', truncated: true, chars: 9000 } },
						stdout: { text: 'hello', truncated: false, chars: 5 },
						truncated: true,
						storedChars: 11,
					},
				},
				old: {
					status: 'completed',
					startedAt: '2026-10-24T10:00:01.000Z',
					completedAt: '2026-10-24T10:00:02.000Z',
				},
			},
		};
		fs.writeFileSync(path.join(configDir, 'executions', 'i0c0ffee.json'), JSON.stringify(record));
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	const show = (...extra: string[]): string => {
		const program = new Command();
		program.exitOverride();
		registerShowCommand(program, () => configDir);
		program.parse(['node', 'test', 'show', 'i0c0ffee', ...extra]);
		return consoleSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	};

	it('prints no recorded value by default, to keep the output small', () => {
		const out = show();

		expect(out).toContain('recorded  [completed]');
		expect(out).not.toContain('env.REGION');
		expect(out).not.toContain('not recorded for this run');
	});

	it('prints what each step received and produced with --io, truncation included', () => {
		const out = show('--io');

		expect(out).toContain('env.REGION: eu');
		expect(out).toContain('plan (truncated, 4 of 9000 chars kept):');
		expect(out).toContain('stdout:');
		expect(out).toContain('inputs/outputs: not recorded for this run');
	});
});

describe('ShowCommand: flow version of a file', () => {
	let configDir: string;
	let file: string;

	const flowText = (version: string | undefined, script = 'echo hi'): string =>
		yaml.dump({
			id: 'shown',
			...(version === undefined ? {} : { version }),
			name: 'Shown',
			description: 'd',
			workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'if-available' },
			steps: [{ id: 's', name: 'S', type: 'script', script }],
		});
	const show = (): string => {
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const program = new Command();
		program.exitOverride();
		registerShowCommand(program, () => configDir);
		program.parse(['node', 'test', 'show', file]);
		return log.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	};

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'show-version-'));
		file = path.join(configDir, 'shown.yml');
	});
	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it('says a never-run version is new content', () => {
		fs.writeFileSync(file, flowText('1.0.0'));

		expect(show()).toContain('Version:   1.0.0 (new content, never run)');
	});

	it('warns when the version is not above the latest known one but the content differs', () => {
		const store = new DefinitionSnapshotStore(path.join(configDir, 'definitions'));
		store.save({
			flowId: 'shown',
			version: '2.0.0',
			hash: hashDefinition(yaml.load(flowText('2.0.0'))),
			text: 'x',
		});
		fs.writeFileSync(file, flowText('1.0.0', 'echo changed'));

		const out = show();

		expect(out).toContain('Version:   1.0.0 (new content, latest known: 2.0.0)');
		expect(out).toMatch(/warning: Version 1\.0\.0 is lower than the latest known version 2\.0\.0/);
	});

	it('reports a changed content under an existing version as an error line', () => {
		const store = new DefinitionSnapshotStore(path.join(configDir, 'definitions'));
		store.save({
			flowId: 'shown',
			version: '1.0.0',
			hash: hashDefinition(yaml.load(flowText('1.0.0'))),
			text: 'x',
		});
		fs.writeFileSync(file, flowText('1.0.0', 'echo changed'));

		expect(show()).toMatch(/Version: {3}1\.0\.0 \(conflict\)\n {2}error: .*bump the version/);
	});

	it('warns that a flow without a version counts as 0.0.0', () => {
		fs.writeFileSync(file, flowText(undefined));

		expect(show()).toMatch(/warning: Flow 'shown' has no version/);
	});
});
