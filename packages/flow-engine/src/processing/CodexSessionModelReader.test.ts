import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CodexSessionModelReader, MAX_SESSION_FILE_BYTES } from './CodexSessionModelReader';

const THREAD_ID = '01a202cd-e330-7612-8713-15bcc0f8469d';
const FILE_NAME = `rollout-2026-11-22T11-29-37-${THREAD_ID}.jsonl`;

// Real line shapes (codex-cli 0.171.0), trimmed of the private paths and of the long instruction texts
const sessionMeta = JSON.stringify({
	timestamp: '2026-11-22T10:29:37.513Z',
	ordinal: 0,
	type: 'session_meta',
	payload: { account_scoped: true, session_id: THREAD_ID, id: THREAD_ID, cwd: '<cwd>' },
});
const turnContext = (model: string, ordinal: number): string =>
	JSON.stringify({
		timestamp: '2026-11-22T10:29:37.624Z',
		ordinal,
		type: 'turn_context',
		payload: {
			turn_id: '01a202cd-e3fb-70d0-a2ce-61e964894171',
			cwd: '<cwd>',
			approval_policy: 'never',
			model,
			collaboration_mode: { mode: 'default', settings: { model } },
		},
	});

describe('CodexSessionModelReader', () => {
	let home: string;
	let dayFolder: string;

	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-reader-'));
		dayFolder = path.join(home, 'sessions', '2026', '11', '22');
		fs.mkdirSync(dayFolder, { recursive: true });
	});
	afterEach(() => {
		fs.rmSync(home, { recursive: true, force: true });
	});

	const write = (lines: string[], folder = dayFolder, name = FILE_NAME): string => {
		fs.mkdirSync(folder, { recursive: true });
		const filePath = path.join(folder, name);
		fs.writeFileSync(filePath, lines.join('\n') + '\n');
		return filePath;
	};

	it('returns the model of the turn_context', () => {
		write([sessionMeta, turnContext('openai.gpt-5.6-luna', 7)]);
		expect(new CodexSessionModelReader(home).read(THREAD_ID)).toEqual({ model: 'openai.gpt-5.6-luna' });
	});

	it('returns the model of a resumed thread appended to the same file (same model)', () => {
		write([sessionMeta, turnContext('openai.gpt-5.6-luna', 7), turnContext('openai.gpt-5.6-luna', 18)]);
		expect(new CodexSessionModelReader(home).read(THREAD_ID)).toEqual({ model: 'openai.gpt-5.6-luna' });
	});

	it('returns the model of the LAST turn_context when the resumed turn used another model', () => {
		write([sessionMeta, turnContext('openai.gpt-5.6-luna', 7), turnContext('openai.gpt-5.6-sol', 18)]);
		expect(new CodexSessionModelReader(home).read(THREAD_ID)).toEqual({ model: 'openai.gpt-5.6-sol' });
	});

	it('uses CODEX_HOME when no home is given', () => {
		write([turnContext('openai.gpt-5.6-terra', 7)]);
		const previous = process.env['CODEX_HOME'];
		process.env['CODEX_HOME'] = home;
		try {
			expect(new CodexSessionModelReader().read(THREAD_ID)).toEqual({ model: 'openai.gpt-5.6-terra' });
		} finally {
			if (previous === undefined) delete process.env['CODEX_HOME'];
			else process.env['CODEX_HOME'] = previous;
		}
	});

	it('finds the file in another day folder and ignores files of other threads', () => {
		write([turnContext('other-model', 1)], path.join(home, 'sessions', '2026', '11', '23'), 'rollout-x-other-id.jsonl');
		write([turnContext('openai.gpt-5.6-luna', 1)], path.join(home, 'sessions', '2026', '10', '03'));
		expect(new CodexSessionModelReader(home).read(THREAD_ID)).toEqual({ model: 'openai.gpt-5.6-luna' });
	});

	it('names the path when there is no session file', () => {
		const result = new CodexSessionModelReader(home).read(THREAD_ID);
		expect(result).toEqual({ unknownReason: expect.stringContaining(path.join(home, 'sessions')) });
		expect('unknownReason' in result && result.unknownReason).toContain(`rollout-*-${THREAD_ID}.jsonl`);
	});

	it('names the path when the sessions folder does not exist', () => {
		const missing = path.join(home, 'nowhere');
		const result = new CodexSessionModelReader(missing).read(THREAD_ID);
		expect('unknownReason' in result && result.unknownReason).toContain(path.join(missing, 'sessions'));
	});

	it('reports an empty file as having no turn_context', () => {
		const filePath = path.join(dayFolder, FILE_NAME);
		fs.writeFileSync(filePath, '');
		const result = new CodexSessionModelReader(home).read(THREAD_ID);
		expect('unknownReason' in result && result.unknownReason).toContain(filePath);
		expect('unknownReason' in result && result.unknownReason).toContain('no turn_context');
	});

	it('reports a file without turn_context', () => {
		write([sessionMeta]);
		const result = new CodexSessionModelReader(home).read(THREAD_ID);
		expect('unknownReason' in result && result.unknownReason).toContain('no turn_context');
	});

	it('skips a line that is not JSON, says so, and still finds the model', () => {
		write([sessionMeta, '{"timestamp": broken', turnContext('openai.gpt-5.6-luna', 7), '{"partial":']);
		expect(new CodexSessionModelReader(home).read(THREAD_ID)).toEqual({ model: 'openai.gpt-5.6-luna' });
	});

	it('mentions the skipped lines when no turn_context is found', () => {
		write([sessionMeta, 'not json']);
		const result = new CodexSessionModelReader(home).read(THREAD_ID);
		expect('unknownReason' in result && result.unknownReason).toContain('1 line(s) that are not JSON were skipped');
	});

	it.each([
		['missing', undefined],
		['empty', ''],
		['not a string', 5],
	])('is unknown when the model of the last turn_context is %s', (_label, model) => {
		const line = JSON.stringify({ type: 'turn_context', payload: model === undefined ? {} : { model } });
		write([turnContext('openai.gpt-5.6-luna', 7), line]);
		const result = new CodexSessionModelReader(home).read(THREAD_ID);
		expect('unknownReason' in result && result.unknownReason).toContain('payload.model');
	});

	it('does not read a file above the size limit and says so', () => {
		const filePath = path.join(dayFolder, FILE_NAME);
		fs.writeFileSync(filePath, Buffer.alloc(MAX_SESSION_FILE_BYTES + 1, 'a'));
		const result = new CodexSessionModelReader(home).read(THREAD_ID);
		expect('unknownReason' in result && result.unknownReason).toContain(filePath);
		expect('unknownReason' in result && result.unknownReason).toContain('read limit');
	});

	it('refuses a thread id that is not a plain id', () => {
		const result = new CodexSessionModelReader(home).read('../evil');
		expect('unknownReason' in result && result.unknownReason).toContain('not a plain id');
	});
});
