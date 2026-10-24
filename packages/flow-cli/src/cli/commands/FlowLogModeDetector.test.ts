import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { hasFastLogMode } from './FlowLogModeDetector';

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-mode-test-'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(content: string): string {
	const file = path.join(tmpDir, 'flow.yml');
	fs.writeFileSync(file, content);
	return file;
}

describe('hasFastLogMode', () => {
	it.each(['streaming', 'polling'])('is true when a step logs %s', mode => {
		expect(hasFastLogMode(write(`steps:\n  - id: a\n    log: ${mode}\n`))).toBe(true);
	});

	it('is false for other log modes and for a flow without steps', () => {
		expect(hasFastLogMode(write('steps:\n  - id: a\n    log: final\n'))).toBe(false);
		expect(hasFastLogMode(write('name: x\n'))).toBe(false);
	});

	it('is false for a missing or unparsable file', () => {
		expect(hasFastLogMode(path.join(tmpDir, 'missing.yml'))).toBe(false);
		expect(hasFastLogMode(write('a: [unclosed'))).toBe(false);
	});
});
