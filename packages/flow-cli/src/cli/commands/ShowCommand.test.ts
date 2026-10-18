import { Command } from 'commander';
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
