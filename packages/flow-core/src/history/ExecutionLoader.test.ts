import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { loadExecutions } from './ExecutionLoader.js';

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
});
