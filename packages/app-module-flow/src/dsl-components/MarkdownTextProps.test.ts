import { describe, expect, it } from 'vitest';

import { MARKDOWN_TEXT_KEYS, isCssLength, readMarkdownTextProps } from './MarkdownTextProps.js';
import { safeLinkTarget } from './SafeLinkTarget.js';

describe('readMarkdownTextProps', () => {
	it('resolves text and maxHeight against the context', () => {
		const props = readMarkdownTextProps(
			{ text: '$ctx.row.markdown', maxHeight: '30rem' },
			{ row: { markdown: '# hi' } }
		);
		expect(props).toEqual({ text: '# hi', maxHeight: '30rem', unexpectedKeys: [] });
	});

	it('lists the keys outside the contract, sorted, ignoring engine keys', () => {
		const props = readMarkdownTextProps(
			{ $type: 'flow:MarkdownText', $if: 'x', text: 'a', style: 'b', className: 'c' },
			{}
		);
		expect(props.unexpectedKeys).toEqual(['className', 'style']);
	});

	it('declares exactly text and maxHeight', () => {
		expect([...MARKDOWN_TEXT_KEYS]).toEqual(['text', 'maxHeight']);
	});
});

describe('isCssLength', () => {
	it.each(['30rem', '20px', '50vh', '12.5em', '0'])('accepts %s', value => {
		expect(isCssLength(value)).toBe(true);
	});
	it.each(['', 'calc(1px)', '10rem; color:red', 'url(x)', '-3px', 'auto', '10'])('refuses %s', value => {
		expect(isCssLength(value)).toBe(false);
	});
});

describe('safeLinkTarget', () => {
	it.each([
		['https://example.com/a', 'https://example.com/a'],
		['http://example.com', 'http://example.com'],
		['mailto:a@example.com', 'mailto:a@example.com'],
	])('keeps %s', (target, expected) => {
		expect(safeLinkTarget(target)).toBe(expected);
	});
	it.each([
		'javascript:alert(1)',
		' JAVASCRIPT:alert(1)',
		'java\tscript:alert(1)',
		'data:text/html,x',
		'file:///x',
		'/relative',
		'#anchor',
		'',
	])('drops %j', target => {
		expect(safeLinkTarget(target)).toBe('');
	});
});
