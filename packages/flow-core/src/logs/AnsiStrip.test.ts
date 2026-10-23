import { describe, expect, it } from 'vitest';

import { stripAnsi } from './AnsiStrip.js';

const ESC = '\u001b';
const BEL = '\u0007';

describe('stripAnsi', () => {
	it('leaves plain text, tabs, newlines, unicode and an empty string unchanged', () => {
		const plain = 'line one\n\tindented 100% done - caf\u00e9 \u4e2d\u6587\nlast';
		expect(stripAnsi(plain)).toBe(plain);
		expect(stripAnsi('')).toBe('');
	});

	it('removes colour and style codes, keeping the text', () => {
		expect(stripAnsi(`${ESC}[36mcyan${ESC}[0m and ${ESC}[1;31mbold red${ESC}[m!`)).toBe('cyan and bold red!');
	});

	it('removes 256-colour and truecolour codes in both separator styles', () => {
		expect(stripAnsi(`${ESC}[38;5;208morange${ESC}[0m`)).toBe('orange');
		expect(stripAnsi(`${ESC}[48;2;10;20;30mbg${ESC}[0m ${ESC}[38:2::1:2:3mfg${ESC}[0m`)).toBe('bg fg');
	});

	it('removes cursor movement, erasure and private-mode sequences', () => {
		expect(stripAnsi(`${ESC}[2K${ESC}[1Gready${ESC}[3A${ESC}[10;20H${ESC}[?25l${ESC}[?25h`)).toBe('ready');
	});

	it('removes window-title OSC ended by BEL or by ST', () => {
		expect(stripAnsi(`${ESC}]0;my title${BEL}text`)).toBe('text');
		expect(stripAnsi(`${ESC}]2;my title${ESC}\\text`)).toBe('text');
	});

	it('removes OSC 8 hyperlinks and keeps their label', () => {
		const link = `${ESC}]8;;https://example.com/a?b=1${ESC}\\the label${ESC}]8;;${ESC}\\`;
		expect(stripAnsi(`see ${link} now`)).toBe('see the label now');
		const withBell = `${ESC}]8;id=1;https://example.com${BEL}label${ESC}]8;;${BEL}`;
		expect(stripAnsi(withBell)).toBe('label');
	});

	it('removes two-character escapes and charset selection', () => {
		expect(stripAnsi(`${ESC}creset${ESC}M${ESC}7saved${ESC}(Bdone`)).toBe('resetsaveddone');
	});

	it('removes DCS and APC strings', () => {
		expect(stripAnsi(`a${ESC}Pq#0;2;0;0;0${ESC}\\b${ESC}_app data${ESC}\\c`)).toBe('abc');
	});

	it('drops a sequence cut at the end of the text', () => {
		expect(stripAnsi(`text${ESC}`)).toBe('text');
		expect(stripAnsi(`text${ESC}[`)).toBe('text');
		expect(stripAnsi(`text${ESC}[38;5;`)).toBe('text');
		expect(stripAnsi(`text${ESC}]8;;https://exa`)).toBe('text');
	});

	it('does not let an unterminated OSC swallow the next line or the next sequence', () => {
		expect(stripAnsi(`a${ESC}]0;title\nnext line`)).toBe('a\nnext line');
		expect(stripAnsi(`a${ESC}]0;title${ESC}[31mred`)).toBe('ared');
	});

	it('keeps the text after a malformed CSI', () => {
		expect(stripAnsi(`a${ESC}[12\u0001b`)).toBe('a' + 'b');
		expect(stripAnsi(`a${ESC}\nb`)).toBe('a\nb');
	});

	it('removes C1 CSI and other control characters but keeps tab and newline', () => {
		expect(stripAnsi('a\u009b31mb\u0000c\u0008d\u007fe\tf\ng')).toBe('abcde\tf\ng');
	});

	it('keeps the last write of a progress line overwritten with carriage returns', () => {
		expect(stripAnsi('10%\r50%\r100%\ndone')).toBe('100%\ndone');
		expect(stripAnsi('downloading\r\n')).toBe('downloading\n');
		expect(stripAnsi('a\r\nb\r\n')).toBe('a\nb\n');
		expect(stripAnsi('spinner\r')).toBe('spinner');
		expect(stripAnsi('\r\r')).toBe('');
	});

	it('combines colours and overwrites', () => {
		expect(stripAnsi(`${ESC}[32m10%${ESC}[0m\r${ESC}[32m100%${ESC}[0m\n`)).toBe('100%\n');
	});

	it('is idempotent', () => {
		const once = stripAnsi(`${ESC}[36mcyan${ESC}[0m\r\nx\r`);
		expect(stripAnsi(once)).toBe(once);
	});

	describe('performance', () => {
		const inputs: Record<string, string> = {
			'200 KB of coloured lines': `${ESC}[36mline of output${ESC}[0m\n`.repeat(8000),
			'200 KB of plain text': 'plain text line\n'.repeat(13000),
			'200 KB of escapes only': `${ESC}[`.repeat(100_000),
			'200 KB of unterminated OSC starts': `${ESC}]8;;`.repeat(40_000),
			'200 KB of one unterminated OSC': `${ESC}]0;${'a'.repeat(200_000)}`,
			'200 KB of CSI parameters without final byte': `${ESC}[${'1;'.repeat(100_000)}`,
			'200 KB of carriage returns': 'x\r'.repeat(100_000),
		};
		it.each(Object.entries(inputs))('handles %s in linear time', (_name, input) => {
			const started = Date.now();
			stripAnsi(input);
			expect(Date.now() - started).toBeLessThan(1000);
		});
	});
});
