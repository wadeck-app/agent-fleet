import type { LiveLogEntry } from 'flow-engine/src/types.js';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LogWriter } from './LogWriter.js';

let tmpDir: string;

function makeEntry(message: string): LiveLogEntry {
	return { id: crypto.randomUUID(), timestamp: Date.now(), level: 'info', eventType: 'result', message };
}

beforeEach(() => {
	tmpDir = path.join(os.tmpdir(), `log-writer-test-${crypto.randomUUID()}`);
	fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('LogWriter', () => {
	it('writes NDJSON line to daily file', () => {
		const writer = new LogWriter(tmpDir, 30);
		writer.write('exec1234', 'greet', makeEntry('hello'));
		const today = new Date().toISOString().slice(0, 10);
		const filePath = path.join(tmpDir, `${today}.ndjson`);
		expect(fs.existsSync(filePath)).toBe(true);
		const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
		expect(lines.length).toBe(1);
		const parsed = JSON.parse(lines[0]!);
		expect(parsed.prefix).toBe('[exec1234|greet]');
		expect(parsed.message).toBe('hello');
		expect(parsed.level).toBe('info');
	});

	it('writes execution-level log with __execution stepId', () => {
		const writer = new LogWriter(tmpDir, 30);
		writer.writeExecution('exec5678', 'flow started');
		const today = new Date().toISOString().slice(0, 10);
		const content = fs.readFileSync(path.join(tmpDir, `${today}.ndjson`), 'utf8');
		expect(content).toContain('[exec5678|__execution]');
	});

	it('multiplexes multiple executions in same file', () => {
		const writer = new LogWriter(tmpDir, 30);
		writer.write('exec0001', 's1', makeEntry('msg1'));
		writer.write('exec0002', 's2', makeEntry('msg2'));
		const today = new Date().toISOString().slice(0, 10);
		const lines = fs
			.readFileSync(path.join(tmpDir, `${today}.ndjson`), 'utf8')
			.trim()
			.split('\n');
		expect(lines.length).toBe(2);
	});

	it('does not throw when logsDir does not exist, writes error to stderr', () => {
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		try {
			const nonexistentDir = path.join(tmpDir, 'does-not-exist');
			const writer = new LogWriter(nonexistentDir, 30);
			expect(() => writer.write('exec1234', 'step1', makeEntry('hello'))).not.toThrow();
			const stderrOutput = stderrSpy.mock.calls.map(c => String(c[0])).join('');
			expect(stderrOutput).toContain('[LogWriter] failed to write log');
		} finally {
			stderrSpy.mockRestore();
		}
	});

	it('rotates old files beyond retainDays', () => {
		const writer = new LogWriter(tmpDir, 2);
		// Create 3 old files
		for (let i = 0; i < 3; i++) {
			const date = new Date(Date.now() - (i + 1) * 86400000).toISOString().slice(0, 10);
			fs.writeFileSync(path.join(tmpDir, `${date}.ndjson`), '{}');
		}
		// Writing triggers rotation
		writer.write('exec9999', 'step', makeEntry('trigger rotation'));
		const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.ndjson'));
		expect(files.length).toBeLessThanOrEqual(2);
	});
});
