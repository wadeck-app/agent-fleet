import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadExecutionReport } from '../history/ExecutionLoader.js';
import { FlowConfigFixture } from './FlowConfigFixture.js';

describe('FlowConfigFixture', () => {
	let fixture: FlowConfigFixture;

	afterEach(() => {
		fixture.dispose();
	});

	it('writes records the loader reads back', () => {
		fixture = new FlowConfigFixture();
		fixture.addExecution({ executionId: 'abc12345', status: 'failed' });
		const { executions, skipped } = loadExecutionReport(join(fixture.configDir, 'executions'));
		expect(skipped).toEqual([]);
		expect(executions).toMatchObject([{ executionId: 'abc12345', status: 'failed', flowId: 'deploy' }]);
	});

	it('keeps a raw file as given and writes one log per day', () => {
		fixture = new FlowConfigFixture('custom');
		fixture.addRawExecutionFile('bad', '{ nope');
		fixture.addLog('2026-10-18', ['a', 'b']);
		expect(readFileSync(join(fixture.configDir, 'executions', 'bad.json'), 'utf8')).toBe('{ nope');
		expect(readFileSync(join(fixture.configDir, 'logs', '2026-10-18.ndjson'), 'utf8')).toBe('a\nb\n');
		expect(fixture.configDir).toContain('custom-');
	});

	it('removes its directory on dispose', () => {
		fixture = new FlowConfigFixture();
		fixture.dispose();
		expect(existsSync(fixture.configDir)).toBe(false);
	});
});
