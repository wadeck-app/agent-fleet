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
			expect(out).toContain('relaunch 1 (sub-step failed) 2026-10-04 14:00:02: gate_ui failed: 2 tests red');
			expect(out).not.toContain('more detail');
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
