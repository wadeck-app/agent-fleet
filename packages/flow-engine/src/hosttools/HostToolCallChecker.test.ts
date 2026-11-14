import { describe, expect, it } from 'vitest';

import { HostToolCallChecker } from './HostToolCallChecker';
import type { HostTool } from './HostToolTypes';

function toolWith(args: HostTool['args']): HostTool {
	return {
		id: 'queue-task-show',
		description: 'Show a task',
		sideEffect: 'read',
		command: ['task', 'show', '{id}'],
		args,
	};
}

const STRING_TOOL = toolWith({ id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', required: true } });

describe('HostToolCallChecker - hostile string values', () => {
	// Every one must be refused: they are the values a steered model would try.
	it.each([
		['a command separator', 'a;rm -rf /'],
		['a background operator', 'a&b'],
		['a pipe', 'a|b'],
		['a command substitution', '$(id)'],
		['a backtick substitution', '`id`'],
		['a leading dash (option injection)', '-rf'],
		['a double dash option', '--exec=sh'],
		['a lone dash', '-'],
		['a path traversal', '../etc/passwd'],
		['a space', 'a b'],
		['a newline', 'a\nb'],
		['a trailing newline', 'abc\n'],
		['a carriage return', 'a\rb'],
		['a NUL', 'a\u0000b'],
		['an empty string', ''],
		['a value above the pattern length', 'a'.repeat(65)],
		['a value above the absolute length cap', 'a'.repeat(2000)],
	])('refuses %s', (_label, value) => {
		const result = HostToolCallChecker.check(STRING_TOOL, { id: value });
		expect(result.ok).toBe(false);
	});

	it('refuses a NUL even when the pattern would let it through', () => {
		const tool = toolWith({ id: { type: 'string', pattern: '^.+$' } });
		expect(HostToolCallChecker.check(tool, { id: 'a\u0000b' }).ok).toBe(false);
	});

	it('accepts a value that matches', () => {
		expect(HostToolCallChecker.check(STRING_TOOL, { id: 'T-42_a' })).toEqual({
			ok: true,
			values: { id: 'T-42_a' },
		});
	});

	it('refuses a leading dash by name of the rule, so the model can correct itself', () => {
		const result = HostToolCallChecker.check(STRING_TOOL, { id: '-rf' });
		expect(result).toMatchObject({ ok: false });
		expect((result as { message: string }).message).toContain("argument 'id'");
		expect((result as { message: string }).message).toContain("starts with '-'");
	});

	it('accepts a leading dash only when the argument allows it explicitly', () => {
		const tool = toolWith({ id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', allowLeadingDash: true } });
		expect(HostToolCallChecker.check(tool, { id: '-rf' })).toEqual({ ok: true, values: { id: '-rf' } });
	});

	it('still applies the pattern when the leading dash is allowed', () => {
		const tool = toolWith({ id: { type: 'string', pattern: '^[a-z-]+$', allowLeadingDash: true } });
		expect(HostToolCallChecker.check(tool, { id: '-a;b' }).ok).toBe(false);
	});

	it('matches the WHOLE value even when the pattern has an alternation', () => {
		const tool = toolWith({ id: { type: 'string', pattern: '^a|b$' } });
		expect(HostToolCallChecker.check(tool, { id: 'a; rm' }).ok).toBe(false);
		expect(HostToolCallChecker.check(tool, { id: 'xb' }).ok).toBe(false);
		expect(HostToolCallChecker.check(tool, { id: 'b' }).ok).toBe(true);
	});
});

describe('HostToolCallChecker - arguments', () => {
	it('refuses an argument the tool does not declare, with a suggestion', () => {
		const result = HostToolCallChecker.check(STRING_TOOL, { id: 'a', idd: 'b' });
		expect(result.ok).toBe(false);
		expect((result as { message: string }).message).toContain("'idd'");
		expect((result as { message: string }).message).toContain("Did you mean 'id'");
	});

	it('refuses an argument when the tool declares none', () => {
		const result = HostToolCallChecker.check(toolWith(undefined), { id: 'a' });
		expect(result.ok).toBe(false);
	});

	it('refuses a missing required argument', () => {
		const result = HostToolCallChecker.check(STRING_TOOL, {});
		expect(result.ok).toBe(false);
		expect((result as { message: string }).message).toContain("'id' is required");
	});

	it('accepts a missing optional argument and omits it from the values', () => {
		const tool = toolWith({ id: { type: 'string', pattern: '^a$' } });
		expect(HostToolCallChecker.check(tool, {})).toEqual({ ok: true, values: {} });
	});

	it.each([
		['null', null],
		['a list', []],
		['a string', 'id=a'],
		['a number', 3],
	])('refuses arguments that are %s', (_label, args) => {
		expect(HostToolCallChecker.check(STRING_TOOL, args).ok).toBe(false);
	});

	it('treats undefined arguments as none', () => {
		expect(HostToolCallChecker.check(toolWith(undefined), undefined)).toEqual({ ok: true, values: {} });
	});

	it.each([
		['a number for a string', { id: 5 }],
		['a boolean for a string', { id: true }],
		['null for a string', { id: null }],
		['an object for a string', { id: { a: 1 } }],
		['a list for a string', { id: ['a'] }],
	])('refuses %s', (_label, args) => {
		expect(HostToolCallChecker.check(STRING_TOOL, args).ok).toBe(false);
	});
});

describe('HostToolCallChecker - other types', () => {
	const tool = toolWith({
		status: { type: 'enum', values: ['open', 'done'] },
		limit: { type: 'integer', min: 1, max: 50 },
		verbose: { type: 'boolean' },
	});

	it('accepts an enum member, an in-range integer and a boolean, and renders them as strings', () => {
		expect(HostToolCallChecker.check(tool, { status: 'open', limit: 50, verbose: false })).toEqual({
			ok: true,
			values: { status: 'open', limit: '50', verbose: 'false' },
		});
	});

	it.each([
		['an enum value outside the list', { status: 'closed' }],
		['an enum value with different case', { status: 'Open' }],
		['an integer below min', { limit: 0 }],
		['an integer above max', { limit: 51 }],
		['a fractional number', { limit: 1.5 }],
		['an integer given as a string', { limit: '5' }],
		['NaN', { limit: Number.NaN }],
		['Infinity', { limit: Number.POSITIVE_INFINITY }],
		['a boolean given as a string', { verbose: 'true' }],
		['a boolean given as a number', { verbose: 1 }],
	])('refuses %s', (_label, args) => {
		expect(HostToolCallChecker.check(tool, args).ok).toBe(false);
	});

	it('lists the allowed enum values in the message', () => {
		const result = HostToolCallChecker.check(tool, { status: 'closed' });
		expect((result as { message: string }).message).toContain('open, done');
	});

	it('refuses a negative integer (it would start with a dash) unless allowed', () => {
		const negative = toolWith({ delta: { type: 'integer', min: -5, max: 5 } });
		expect(HostToolCallChecker.check(negative, { delta: -1 }).ok).toBe(false);
		expect(HostToolCallChecker.check(negative, { delta: 1 }).ok).toBe(true);
		const allowed = toolWith({ delta: { type: 'integer', min: -5, max: 5, allowLeadingDash: true } });
		expect(HostToolCallChecker.check(allowed, { delta: -1 })).toEqual({ ok: true, values: { delta: '-1' } });
	});

	it('refuses an enum value that starts with a dash unless allowed', () => {
		const dashed = toolWith({ mode: { type: 'enum', values: ['-v', 'plain'] } });
		expect(HostToolCallChecker.check(dashed, { mode: '-v' }).ok).toBe(false);
		const allowed = toolWith({ mode: { type: 'enum', values: ['-v', 'plain'], allowLeadingDash: true } });
		expect(HostToolCallChecker.check(allowed, { mode: '-v' }).ok).toBe(true);
	});
});
