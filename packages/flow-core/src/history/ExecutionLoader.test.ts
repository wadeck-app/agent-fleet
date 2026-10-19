import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { describeSkippedExecutions, loadExecutionReport, loadExecutions } from './ExecutionLoader.js';

describe('loadExecutions', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-history-test-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('returns empty array when dir does not exist', () => {
		expect(loadExecutions('/nonexistent/dir')).toEqual([]);
	});

	it('returns empty array when dir has no json files', () => {
		expect(loadExecutions(tmpDir)).toEqual([]);
	});

	it('loads and parses execution files', () => {
		const exec = makeExec({ executionId: 'abc123' });
		fs.writeFileSync(path.join(tmpDir, 'abc123.json'), JSON.stringify(exec));
		const result = loadExecutions(tmpDir);
		expect(result).toHaveLength(1);
		expect(result[0]!.executionId).toBe('abc123');
	});

	it('sorts by startedAt descending (newest first)', () => {
		fs.writeFileSync(
			path.join(tmpDir, 'old.json'),
			JSON.stringify(makeExec({ executionId: 'old', startedAt: '2026-08-15T10:00:00.000Z' }))
		);
		fs.writeFileSync(
			path.join(tmpDir, 'new.json'),
			JSON.stringify(makeExec({ executionId: 'new', startedAt: '2026-08-16T10:00:00.000Z' }))
		);
		const result = loadExecutions(tmpDir);
		expect(result[0]!.executionId).toBe('new');
		expect(result[1]!.executionId).toBe('old');
	});

	it('skips malformed json files', () => {
		fs.writeFileSync(path.join(tmpDir, 'bad.json'), 'not-json');
		fs.writeFileSync(path.join(tmpDir, 'good.json'), JSON.stringify(makeExec({ executionId: 'good' })));
		expect(loadExecutions(tmpDir)).toHaveLength(1);
	});
	it('skips a record without a steps object so one damaged file cannot break every listing', () => {
		fs.writeFileSync(
			path.join(tmpDir, 'nosteps.json'),
			JSON.stringify({ executionId: 'nosteps', status: 'failed' })
		);
		fs.writeFileSync(
			path.join(tmpDir, 'nullsteps.json'),
			JSON.stringify({ executionId: 'nullsteps', steps: null })
		);
		fs.writeFileSync(path.join(tmpDir, 'good.json'), JSON.stringify(makeExec({ executionId: 'good' })));
		expect(loadExecutions(tmpDir).map(e => e.executionId)).toEqual(['good']);
	});
});

describe('loadExecutionReport', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-history-report-'));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('reports nothing skipped when every file is a valid record', () => {
		fs.writeFileSync(path.join(tmpDir, 'good.json'), JSON.stringify(makeExec({ executionId: 'good' })));
		const report = loadExecutionReport(tmpDir);
		expect(report.executions.map(e => e.executionId)).toEqual(['good']);
		expect(report.skipped).toEqual([]);
	});

	it('names the file and the reason for an unparsable file', () => {
		fs.writeFileSync(path.join(tmpDir, 'bad.json'), 'not-json');
		const { skipped } = loadExecutionReport(tmpDir);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]!.file).toBe(path.join(tmpDir, 'bad.json'));
		expect(skipped[0]!.reason).toMatch(/^not valid JSON: /);
	});

	it('names the file and the reason for a record without executionId or steps', () => {
		fs.writeFileSync(path.join(tmpDir, 'noid.json'), JSON.stringify({ steps: {} }));
		fs.writeFileSync(path.join(tmpDir, 'nosteps.json'), JSON.stringify({ executionId: 'nosteps' }));
		const { skipped } = loadExecutionReport(tmpDir);
		expect(skipped.map(s => [path.basename(s.file), s.reason])).toEqual([
			['noid.json', "missing 'executionId'"],
			['nosteps.json', "missing 'steps' object"],
		]);
	});

	it('reports a file that cannot be read', () => {
		// A directory named like a record: readFileSync fails with EISDIR.
		fs.mkdirSync(path.join(tmpDir, 'dir.json'));
		const { skipped } = loadExecutionReport(tmpDir);
		expect(skipped).toHaveLength(1);
		expect(skipped[0]!.reason).toMatch(/^unreadable: /);
	});
});

describe('describeSkippedExecutions', () => {
	it('is undefined when nothing was skipped', () => {
		expect(describeSkippedExecutions([])).toBeUndefined();
	});

	it('gives path and reason of the single file with the action to take', () => {
		const text = describeSkippedExecutions([{ file: '/x/a.json', reason: "missing 'steps' object" }]);
		expect(text).toBe("1 execution file skipped: /x/a.json (missing 'steps' object). Fix or delete it.");
	});

	it('gives path and reason of the first and the count of the rest', () => {
		const text = describeSkippedExecutions([
			{ file: '/x/a.json', reason: 'not valid JSON: boom' },
			{ file: '/x/b.json', reason: 'x' },
			{ file: '/x/c.json', reason: 'y' },
		]);
		expect(text).toBe(
			'3 execution files skipped; first: /x/a.json (not valid JSON: boom), and 2 more. Fix or delete them.'
		);
	});
});
