import { describe, expect, it } from 'vitest';

import { formatLogContent, formatLogLine, tailLines } from './LogFormat.js';

// Times are rendered in the local zone, so the tests match the shape rather than the hour.
const TIME = '\\d{2}:\\d{2}:\\d{2}\\.\\d{3}';

describe('formatLogLine', () => {
	it('formats a step log entry with its prefix', () => {
		const raw = JSON.stringify({
			prefix: '[abc12345|build]',
			timestamp: '2026-10-18T10:00:00.123Z',
			level: 'warn',
			message: 'disk almost full',
		});
		expect(formatLogLine(raw)).toMatch(new RegExp(`^${TIME} \\[WARN \\] \\[abc12345\\|build\\] disk almost full$`));
	});

	it('formats a daemon log entry', () => {
		const raw = JSON.stringify({ ts: '2026-10-18T10:00:00.000Z', level: 'error', msg: 'boom' });
		expect(formatLogLine(raw)).toMatch(new RegExp(`^${TIME} \\[ERROR\\] boom$`));
	});

	it('defaults the level to info when absent or not a string', () => {
		expect(formatLogLine(JSON.stringify({ ts: '2026-10-18T10:00:00.000Z', msg: 'hi' }))).toContain('[INFO ]');
		expect(formatLogLine(JSON.stringify({ ts: '2026-10-18T10:00:00.000Z', level: 3, msg: 'hi' }))).toContain(
			'[INFO ]'
		);
	});

	it('returns an empty string for a blank line', () => {
		expect(formatLogLine('   ')).toBe('');
	});

	it('returns non-JSON, non-object and unknown-shape lines untouched', () => {
		expect(formatLogLine('plain text')).toBe('plain text');
		expect(formatLogLine('42')).toBe('42');
		expect(formatLogLine('null')).toBe('null');
		expect(formatLogLine('{"other":1}')).toBe('{"other":1}');
	});
});

describe('formatLogContent', () => {
	it('formats every line, drops blank ones and ends with a newline', () => {
		const content = [JSON.stringify({ ts: '2026-10-18T10:00:00.000Z', msg: 'a' }), '', 'raw', ''].join('\n');
		const out = formatLogContent(content);
		expect(out.split('\n')).toHaveLength(3);
		expect(out.endsWith('\n')).toBe(true);
		expect(out).toContain('raw\n');
	});

	it('is empty for empty content', () => {
		expect(formatLogContent('')).toBe('');
	});
});

describe('tailLines', () => {
	it('returns the content unchanged when n is 0 or negative', () => {
		expect(tailLines('a\nb\nc\n', 0)).toBe('a\nb\nc\n');
		expect(tailLines('a\nb\nc\n', -1)).toBe('a\nb\nc\n');
	});

	it('keeps the last n lines, each newline-terminated', () => {
		expect(tailLines('a\nb\nc\n', 2)).toBe('b\nc\n');
	});

	it('handles content without a trailing newline', () => {
		expect(tailLines('a\nb\nc', 2)).toBe('b\nc\n');
	});

	it('returns everything when n exceeds the line count', () => {
		expect(tailLines('a\nb\n', 10)).toBe('a\nb\n');
	});

	it('is empty for empty content', () => {
		expect(tailLines('', 5)).toBe('');
	});
});
