import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionLookupError, renderExecutionDetail, resolveExecution, tailText } from './ExecutionDetail';

const FIXTURE_DIR = path.resolve(__dirname, '../../test-utils/fixtures/executions');

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
