import { describe, expect, it } from 'vitest';

import { BoundedLineBuffer } from './BoundedLineBuffer';

describe('BoundedLineBuffer', () => {
	it('keeps the most recent lines when there are more than the limit', () => {
		const buffer = new BoundedLineBuffer(3, 10_000);

		buffer.append('a\nb\nc\nd\ne\n');

		expect(buffer.snapshot()).toBe('c\nd\ne');
	});

	it('joins a line split across chunks', () => {
		const buffer = new BoundedLineBuffer(10, 10_000);

		buffer.append('hel');
		buffer.append('lo\nwor');
		buffer.append('ld\n');

		expect(buffer.snapshot()).toBe('hello\nworld');
	});

	it('includes a trailing partial line, since a dying process often does not finish it', () => {
		const buffer = new BoundedLineBuffer(10, 10_000);

		buffer.append('done\nfatal: out of mem');

		expect(buffer.snapshot()).toBe('done\nfatal: out of mem');
	});

	it('drops the oldest lines to stay within the byte budget', () => {
		const buffer = new BoundedLineBuffer(100, 20);

		buffer.append('aaaaaaaaaa\nbbbbbbbbbb\ncccccccccc\n');

		const snapshot = buffer.snapshot();
		expect(Buffer.byteLength(snapshot)).toBeLessThanOrEqual(20);
		expect(snapshot.endsWith('cccccccccc')).toBe(true);
		expect(snapshot).not.toContain('aaaa');
	});

	it('truncates a single line longer than the budget, keeping its end', () => {
		const buffer = new BoundedLineBuffer(10, 8);

		buffer.append(`${'x'.repeat(100)}END\n`);

		const snapshot = buffer.snapshot();
		expect(Buffer.byteLength(snapshot)).toBeLessThanOrEqual(8);
		expect(snapshot.endsWith('END')).toBe(true);
	});

	it('is empty before anything is appended', () => {
		expect(new BoundedLineBuffer(3, 100).snapshot()).toBe('');
	});

	it('normalizes CRLF', () => {
		const buffer = new BoundedLineBuffer(3, 100);

		buffer.append('a\r\nb\r\n');

		expect(buffer.snapshot()).toBe('a\nb');
	});
});
