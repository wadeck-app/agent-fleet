import { describe, expect, it } from 'vitest';

import { HostToolHeadCapture } from './HostToolHeadCapture';
import { HostToolTailCapture } from './HostToolTailCapture';
import { Utf8Boundary } from './Utf8Boundary';

describe('HostToolHeadCapture', () => {
	it('keeps the first bytes, counts everything, reports truncation', () => {
		const capture = new HostToolHeadCapture(5);
		capture.push(Buffer.from('abc'));
		capture.push(Buffer.from('defgh'));
		capture.push(Buffer.from('ij'));
		expect(capture.bytes().toString()).toBe('abcde');
		expect(capture.totalBytes).toBe(10);
		expect(capture.truncated).toBe(true);
	});

	it('is not truncated at exactly the limit', () => {
		const capture = new HostToolHeadCapture(3);
		capture.push(Buffer.from('abc'));
		expect(capture.truncated).toBe(false);
	});
});

describe('HostToolTailCapture', () => {
	it('keeps the last bytes only', () => {
		const capture = new HostToolTailCapture(4);
		for (const piece of ['ab', 'cd', 'ef', 'gh']) capture.push(Buffer.from(piece));
		expect(capture.bytes().toString()).toBe('efgh');
		expect(capture.totalBytes).toBe(8);
	});

	it('cuts inside a chunk when needed', () => {
		const capture = new HostToolTailCapture(3);
		capture.push(Buffer.from('abcdef'));
		expect(capture.bytes().toString()).toBe('def');
	});
});

describe('Utf8Boundary', () => {
	it.each([
		{ text: 'aé', max: 2, prefix: 'a', suffix: 'é' },
		{ text: 'a\u{1F600}', max: 4, prefix: 'a', suffix: '\u{1F600}' },
		{ text: 'abc', max: 2, prefix: 'ab', suffix: 'bc' },
		{ text: 'abc', max: 10, prefix: 'abc', suffix: 'abc' },
	])('cuts $text at $max bytes on a boundary', ({ text, max, prefix, suffix }) => {
		expect(Utf8Boundary.prefixOfText(text, max)).toBe(prefix);
		expect(Utf8Boundary.suffixOfText(text, max)).toBe(suffix);
	});
});
