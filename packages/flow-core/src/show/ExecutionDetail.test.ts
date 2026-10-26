import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DEFAULT_TAIL_CHARS,
	ExecutionLookupError,
	renderExecutionDetail,
	resolveExecution,
	tailText,
} from './ExecutionDetail.js';

const FIXTURE_DIR = path.resolve(__dirname, '../testing/fixtures/executions');

describe('ExecutionDetail', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-detail-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	const writeExec = (id: string, body: unknown): string => {
		const file = path.join(tmpDir, `${id}.json`);
		fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
		return file;
	};
	const minimal = (id: string, status = 'completed') => ({
		executionId: id,
		flowFile: 'f.yml',
		flowId: 'f',
		status,
		startedAt: '2026-10-04T14:00:00.000Z',
		completedAt: status === 'running' ? null : '2026-10-04T14:00:05.000Z',
		steps: {
			a: { status: 'completed', startedAt: '2026-10-04T14:00:00.000Z', completedAt: '2026-10-04T14:00:01.000Z' },
		},
	});

	describe('resolveExecution', () => {
		it('resolves an exact id', () => {
			writeExec('abcd1234', minimal('abcd1234'));
			expect(resolveExecution(tmpDir, 'abcd1234').record.executionId).toBe('abcd1234');
		});

		it('resolves a unique prefix', () => {
			writeExec('abcd1234', minimal('abcd1234'));
			writeExec('zzzz9999', minimal('zzzz9999'));
			expect(resolveExecution(tmpDir, 'abc').record.executionId).toBe('abcd1234');
		});

		it('prefers an exact id over longer ids sharing the prefix', () => {
			writeExec('abcd', minimal('abcd'));
			writeExec('abcd1234', minimal('abcd1234'));
			expect(resolveExecution(tmpDir, 'abcd').record.executionId).toBe('abcd');
		});

		it('lists candidates when the prefix is ambiguous', () => {
			writeExec('abcd1234', minimal('abcd1234'));
			writeExec('abce5678', minimal('abce5678'));
			expect(() => resolveExecution(tmpDir, 'abc')).toThrow(/Ambiguous.*abcd1234, abce5678.*longer prefix/);
		});

		it('fails on an unknown id and names the directory', () => {
			expect(() => resolveExecution(tmpDir, 'nope')).toThrow(new RegExp(`No execution matches 'nope' in .*`));
		});

		it('fails when the executions directory does not exist', () => {
			expect(() => resolveExecution(path.join(tmpDir, 'missing'), 'abc')).toThrow(ExecutionLookupError);
		});

		it('rejects ids with path separators or uppercase', () => {
			expect(() => resolveExecution(tmpDir, '../x')).toThrow(/not a valid execution id/);
			expect(() => resolveExecution(tmpDir, 'ABC')).toThrow(/not a valid execution id/);
		});

		it('names the file when the JSON is corrupt', () => {
			const file = writeExec('bad00000', '{ not json');
			expect(() => resolveExecution(tmpDir, 'bad00000')).toThrow(new RegExp(file.replace(/[\\/.]/g, '.')));
		});

		it('rejects JSON that is not an execution record', () => {
			writeExec('bad00001', '{"foo":1}');
			expect(() => resolveExecution(tmpDir, 'bad00001')).toThrow(/not a valid execution record/);
		});
	});

	describe('error kinds', () => {
		const kindOf = (fn: () => unknown): string => {
			try {
				fn();
			} catch (err) {
				if (err instanceof ExecutionLookupError) return err.kind;
				throw err;
			}
			throw new Error('expected ExecutionLookupError');
		};

		it('classifies every failure so callers never parse messages', () => {
			writeExec('abcd1234', minimal('abcd1234'));
			writeExec('abce5678', minimal('abce5678'));
			writeExec('bad00000', '{ not json');
			writeExec('bad00001', '{"foo":1}');
			expect(kindOf(() => resolveExecution(tmpDir, '../x'))).toBe('invalid-id');
			expect(kindOf(() => resolveExecution(tmpDir, 'nope'))).toBe('not-found');
			expect(kindOf(() => resolveExecution(tmpDir, 'abc'))).toBe('ambiguous');
			expect(kindOf(() => resolveExecution(tmpDir, 'bad00000'))).toBe('corrupt');
			expect(kindOf(() => resolveExecution(tmpDir, 'bad00001'))).toBe('invalid-record');
		});
	});

	describe('constants', () => {
		it('exposes a default tail of 2000 characters', () => {
			expect(DEFAULT_TAIL_CHARS).toBe(2000);
		});
	});

	describe('tailText', () => {
		it('returns short text unchanged', () => {
			expect(tailText('abc', 10, '/p.json')).toBe('abc');
		});

		it('keeps the end and reports the dropped count and path', () => {
			const out = tailText('0123456789', 4, '/p.json');
			expect(out).toBe('(6 more chars, see /p.json) ...6789');
		});
	});

	describe('renderExecutionDetail', () => {
		const fixture = () => resolveExecution(FIXTURE_DIR, 'f41lc0de');

		it('labels a lastError on a completed run as recovered and shows attempts with the total time', () => {
			const record = minimal('retry000');
			Object.assign(record, { lastError: 'Script exited with code 1' });
			Object.assign(record.steps.a, { attempts: 3, priorAttemptsMs: 290000 });
			writeExec('retry000', record);
			const out = renderExecutionDetail(resolveExecution(tmpDir, 'retry000'), { tail: 10, full: false });
			expect(out).toContain('Last error (recovered, run completed): Script exited with code 1');
			expect(out).not.toMatch(/^Error:/m);
			expect(out).toContain('a  [completed]  1.0s  attempts: 3 (total 4m51s)');
		});

		it('prints the recorded inputs and outputs of a step only with --io, and says so for an older record', () => {
			const record = minimal('iorecord');
			Object.assign(record.steps.a, {
				io: {
					inputs: { 'inputs.task': { text: 'fix it', truncated: false, chars: 6 } },
					outputs: { plan: { text: 'one', truncated: false, chars: 3 } },
					truncated: false,
					storedChars: 20,
				},
			});
			writeExec('iorecord', record);
			const resolved = resolveExecution(tmpDir, 'iorecord');

			const without = renderExecutionDetail(resolved, { tail: 10, full: false });
			const withIo = renderExecutionDetail(resolved, { tail: 10, full: false, io: true });

			expect(without).not.toContain('inputs.task');
			expect(withIo).toContain('inputs.task: fix it');
			expect(withIo).toContain('plan: one');

			writeExec('oldrecord', minimal('oldrecord'));
			const old = renderExecutionDetail(resolveExecution(tmpDir, 'oldrecord'), {
				tail: 10,
				full: false,
				io: true,
			});
			expect(old).toContain('not recorded for this run');
		});

		it('lists sub-step relaunches under the step with the first feedback line', () => {
			const record = minimal('relaunch');
			Object.assign(record.steps.a, {
				attempts: 2,
				relaunches: [
					{ at: '2026-10-04T14:00:02.000Z', feedback: '\ngate_ui failed: 2 tests red\nmore detail' },
				],
			});
			writeExec('relaunch', record);
			const out = renderExecutionDetail(resolveExecution(tmpDir, 'relaunch'), { tail: 10, full: false });
			expect(out).toContain('relaunch 1 (sub-step failed) 2026-10-04 14:00:02 UTC: gate_ui failed: 2 tests red');
			expect(out).not.toContain('more detail');
		});

		it('labels the Started and Completed times as UTC', () => {
			writeExec('utc', minimal('utc'));
			const out = renderExecutionDetail(resolveExecution(tmpDir, 'utc'), { tail: 10, full: false });
			expect(out).toContain('Started:   2026-10-04 14:00:00 UTC');
			expect(out).toContain('Completed: 2026-10-04 14:00:05 UTC');
		});

		it('shows why a step was not run', () => {
			const record = minimal('skipped');
			Object.assign(record.steps.a, { skippedReason: "not run: sub-step 'x' it depends on did not succeed" });
			writeExec('skipped', record);
			const out = renderExecutionDetail(resolveExecution(tmpDir, 'skipped'), { tail: 10, full: false });
			expect(out).toContain("skipped: not run: sub-step 'x' it depends on did not succeed");
		});

		it('shows status, duration, error, model and cost per step', () => {
			const out = renderExecutionDetail(fixture(), { tail: 2000, full: false });
			expect(out).toContain('Execution: f41lc0de');
			expect(out).toContain('announce  [completed]  39ms');
			expect(out).toContain('classify  [completed]  4.5s  model: claude-haiku-4-5');
			expect(out).toContain('cost: $0.0123 (120 in / 40 out tokens, 4496ms)');
			expect(out).toContain('validate_type  [failed]');
			expect(out).toContain('error: Script exited with code 1');
			expect(out).toContain('set_type  [pending]  -');
			expect(out).toContain('Total cost: $0.0123');
		});

		it('prints the attempts of a step and totals the step cost, not the cumulative session values', () => {
			const record = {
				...minimal('attempts1'),
				steps: {
					ask: {
						status: 'completed',
						startedAt: '2026-10-26T10:00:00.000Z',
						completedAt: '2026-10-26T10:01:00.000Z',
						attempts: 2,
						meta: {
							model: 'haiku',
							session_id: 's1',
							session_file: '',
							ttft_ms: 5,
							duration_ms: 900,
							cost: {
								input_tokens: 4,
								output_tokens: 8,
								cache_read_tokens: 45902,
								cache_write_tokens: 56214,
								usd: 0.00749017,
							},
						},
						attemptLog: [
							{
								n: 1,
								origin: 'first',
								startedAt: '2026-10-26T10:00:00.000Z',
								endedAt: '2026-10-26T10:00:30.000Z',
								durationMs: 30000,
								outcome: 'completed',
								endReason: 'completed',
								provider: 'claude',
								sessionId: 's1',
								usd: 0.00637995,
							},
							{
								n: 2,
								origin: 'relaunch',
								startedAt: '2026-10-26T10:00:30.000Z',
								endedAt: '2026-10-26T10:01:00.000Z',
								durationMs: 30000,
								outcome: 'completed',
								endReason: 'completed',
								provider: 'claude',
								sessionId: 's1',
								usd: 0.00749017,
							},
						],
					},
				},
			};
			writeExec('attempts1', record);
			const out = renderExecutionDetail(resolveExecution(tmpDir, 'attempts1'), { tail: 10, full: false });
			expect(out).toContain('      attempt 1  first');
			expect(out).toContain('      attempt 2  relaunch  30.0s  $0.0011');
			expect(out).toContain('      cost: $0.0075 over 2 attempts');
			expect(out).toContain('  Total cost: $0.0075');
		});

		it('prints only the tail of failed-step output with a marker', () => {
			const out = renderExecutionDetail(fixture(), { tail: 21, full: false });
			expect(out).toContain('END-OF-STDOUT');
			expect(out).not.toContain('START-OF-STDOUT');
			expect(out).toMatch(/\(\d+ more chars, see .*f41lc0de\.json\)/);
			// short stderr is not truncated
			expect(out).toContain('boom: type is invalid');
		});

		it('--full prints the complete output without marker', () => {
			const out = renderExecutionDetail(fixture(), { tail: 5, full: true });
			expect(out).toContain('START-OF-STDOUT');
			expect(out).not.toContain('more chars');
		});

		it('does not print stdout of completed steps', () => {
			const resolved = fixture();
			resolved.record.steps.announce.stdout = 'SHOULD-NOT-APPEAR';
			expect(renderExecutionDetail(resolved, { tail: 2000, full: false })).not.toContain('SHOULD-NOT-APPEAR');
		});

		it('flags a running execution as a snapshot', () => {
			writeExec('run00000', minimal('run00000', 'running'));
			const out = renderExecutionDetail(resolveExecution(tmpDir, 'run00000'), { tail: 10, full: false });
			expect(out).toContain('still running');
			expect(out).toContain('Duration:  running');
		});
	});
});

describe('renderExecutionDetail version line', () => {
	const base = {
		executionId: 'abcd1234',
		flowFile: 'f.yml',
		flowId: 'f',
		status: 'completed' as const,
		currentSteps: [],
		startedAt: '2026-10-04T14:00:00.000Z',
		completedAt: '2026-10-04T14:00:05.000Z',
		steps: {},
	};
	const options = { tail: DEFAULT_TAIL_CHARS, full: false };

	it('prints the version, how it was chosen and the definition hash', () => {
		const text = renderExecutionDetail(
			{
				record: {
					...base,
					flowVersion: '2.0.0',
					definitionHash: 'b'.repeat(64),
					definitionSnapshot: 'f/2.0.0-bbbbbbbbbbbb.yml',
					versionChoice: 'latest',
				},
				filePath: '/e/abcd1234.json',
			},
			options
		);
		expect(text).toContain('Version:   2.0.0 (latest at run start, definition bbbbbbbbbbbb)');
	});

	it('says the version was not recorded for an old record', () => {
		const text = renderExecutionDetail({ record: base, filePath: '/e/abcd1234.json' }, options);
		expect(text).toContain('Version:   not recorded');
	});
});

describe('renderExecutionDetail waves', () => {
	const record = {
		executionId: 'abcd1234',
		flowFile: 'f.yml',
		flowId: 'f',
		status: 'completed' as const,
		currentSteps: [],
		startedAt: '2026-10-04T14:00:00.000Z',
		completedAt: '2026-10-04T14:00:05.000Z',
		steps: {
			impl: { status: 'completed' as const },
			check: { status: 'completed' as const, wave: 1 },
			late: {
				status: 'completed' as const,
				wave: 2,
				skippedReason: 'not run: wave 1 failed, wave 2 was not started',
			},
		},
	};

	it('prints the wave of each sub-step next to its status, with the skip reason of a later wave', () => {
		const lines = renderExecutionDetail(
			{ record, filePath: '/e/abcd1234.json' },
			{ tail: DEFAULT_TAIL_CHARS, full: false }
		).split('\n');
		expect(lines.find(l => l.startsWith('  impl '))).not.toContain('wave');
		expect(lines.find(l => l.startsWith('  check '))).toContain('wave: 1');
		expect(lines.find(l => l.startsWith('  late '))).toContain('wave: 2');
		expect(lines).toContain('      skipped: not run: wave 1 failed, wave 2 was not started');
	});
});
