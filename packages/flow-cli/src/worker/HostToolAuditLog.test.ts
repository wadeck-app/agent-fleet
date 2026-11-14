import type { HostTool } from 'flow-engine';
import * as crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { HostToolAuditLog } from './HostToolAuditLog';
import type { HostToolAuditEntry } from './HostToolAuditLog';

const sha = (value: string): string => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

const TOOL: HostTool = {
	id: 'show',
	description: 'd',
	sideEffect: 'read',
	command: ['x', '{id}', '{note}'],
	args: {
		id: { type: 'string', pattern: '^[A-Za-z0-9-]+$', log: true },
		note: { type: 'string', pattern: '^.*$' },
		count: { type: 'integer', min: 0, max: 9, log: false },
	},
};

const entry = (overrides: Partial<HostToolAuditEntry> = {}): HostToolAuditEntry => ({
	tool: TOOL,
	toolId: 'show',
	callId: 'call-1',
	rawArgs: { id: 'T-1', note: 'SECRET-NOTE-CANARY', count: 4 },
	validated: true,
	outcome: 'ok',
	exitCode: 0,
	durationMs: 12,
	outputBytes: 321,
	truncated: false,
	timedOut: false,
	envDenied: [],
	envMissing: [],
	...overrides,
});

describe('HostToolAuditLog', () => {
	const make = (): { lines: string[]; log: HostToolAuditLog } => {
		const lines: string[] = [];
		return { lines, log: new HostToolAuditLog('triage', line => lines.push(line)) };
	};
	const parse = (line: string): Record<string, any> =>
		JSON.parse(line.slice(line.indexOf('{'))) as Record<string, any>;

	it('writes exactly one line per call, with the fixed fields', () => {
		const { lines, log } = make();
		log.record(entry());
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(/^\[host-tool\] /);
		expect(parse(lines[0]!)).toMatchObject({
			stepId: 'triage',
			toolId: 'show',
			callId: 'call-1',
			outcome: 'ok',
			exitCode: 0,
			durationMs: 12,
			outputBytes: 321,
			truncated: false,
			timedOut: false,
		});
	});

	it('logs argument names with the sha256 of each value, and the value only for log:true', () => {
		const { lines, log } = make();
		log.record(entry());
		const args = parse(lines[0]!)['args'] as Record<string, { sha256: string; value?: unknown }>;
		expect(args['id']).toEqual({ sha256: sha('T-1'), value: 'T-1' });
		expect(args['note']).toEqual({ sha256: sha('SECRET-NOTE-CANARY') });
		expect(args['count']).toEqual({ sha256: sha('4') });
		expect(lines[0]).not.toContain('SECRET-NOTE-CANARY');
	});

	it('never logs a value when the call was denied, even for a log:true argument', () => {
		const { lines, log } = make();
		log.record(
			entry({
				validated: false,
				outcome: 'denied',
				reason: "Tool 'show' was not run: argument 'id' does not match",
				exitCode: null,
			})
		);
		expect(lines[0]).not.toContain('T-1"');
		const args = parse(lines[0]!)['args'] as Record<string, { value?: unknown }>;
		expect(args['id']).not.toHaveProperty('value');
		expect(parse(lines[0]!)['reason']).toContain('does not match');
	});

	it('bounds untrusted names and the number of arguments', () => {
		const { lines, log } = make();
		const rawArgs: Record<string, unknown> = {};
		for (let index = 0; index < 100; index++) rawArgs[`n${index}`] = 'v';
		rawArgs['x'.repeat(500)] = 'v';
		log.record(entry({ validated: false, outcome: 'denied', rawArgs }));
		const args = parse(lines[0]!)['args'] as Record<string, unknown>;
		expect(Object.keys(args).length).toBeLessThanOrEqual(32);
		expect(Object.keys(args).every(name => name.length <= 64)).toBe(true);
	});

	it('does not choke on non-object arguments', () => {
		const { lines, log } = make();
		log.record(entry({ validated: false, outcome: 'denied', rawArgs: 'oops' }));
		expect(parse(lines[0]!)['args']).toEqual({});
	});

	it('records the denied environment names and the missing ones (names only)', () => {
		const { lines, log } = make();
		log.record(entry({ envDenied: ['FLOW_WORKER_TOKEN'], envMissing: ['TASK_PROFILE'] }));
		expect(parse(lines[0]!)).toMatchObject({ envDenied: ['FLOW_WORKER_TOKEN'], envMissing: ['TASK_PROFILE'] });
	});

	it('records timeouts and truncation', () => {
		const { lines, log } = make();
		log.record(entry({ outcome: 'timed_out', timedOut: true, truncated: true, exitCode: null }));
		expect(parse(lines[0]!)).toMatchObject({
			outcome: 'timed_out',
			timedOut: true,
			truncated: true,
			exitCode: null,
		});
	});

	it('the entry type has no field for output content or environment values (canary)', () => {
		const { lines, log } = make();
		// Extra properties a careless caller might add are not copied into the line.
		log.record({
			...entry(),
			output: 'OUTPUT-CANARY',
			env: { TOKEN: 'ENV-CANARY' },
			token: 'TOKEN-CANARY',
		} as HostToolAuditEntry);
		expect(lines[0]).not.toMatch(/OUTPUT-CANARY|ENV-CANARY|TOKEN-CANARY/);
	});

	it('truncates a long reason', () => {
		const { lines, log } = make();
		log.record(entry({ outcome: 'denied', reason: 'r'.repeat(5000) }));
		expect((parse(lines[0]!)['reason'] as string).length).toBeLessThanOrEqual(300);
	});

	describe('model-controlled text is sanitised (control characters, length)', () => {
		const hasControlCharacter = (text: string): boolean =>
			[...text].some(character => {
				const code = character.codePointAt(0)!;
				return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
			});

		it.each([
			{ name: 'CR', input: 'a\rb', expected: 'a\\rb' },
			{ name: 'LF', input: 'a\nb', expected: 'a\\nb' },
			{ name: 'CRLF', input: 'a\r\nb', expected: 'a\\r\\nb' },
			{ name: 'ESC (an ANSI sequence)', input: 'a\u001b[31mred', expected: 'a?[31mred' },
			{ name: 'NUL', input: 'a\u0000b', expected: 'a?b' },
			{ name: 'DEL and a C1 control', input: 'a\u007fb\u0085c', expected: 'a?b?c' },
			{ name: 'a tab', input: 'a\tb', expected: 'a\\tb' },
			{ name: 'plain text, accents included', input: 'Écrit: ok', expected: 'Écrit: ok' },
		])('$name in the reason, the tool id, the call id and an argument name', ({ input, expected }) => {
			const { lines, log } = make();
			log.record(
				entry({
					tool: undefined,
					toolId: `t${input}`,
					callId: `c${input}`,
					reason: `r${input}`,
					validated: false,
					rawArgs: { [`n${input}`]: 'value' },
				})
			);
			// One physical line, whatever the model put in the text.
			expect(hasControlCharacter(lines[0]!)).toBe(false);
			const parsed = parse(lines[0]!);
			expect(parsed['reason']).toBe(`r${expected}`);
			expect(parsed['toolId']).toBe(`t${expected}`);
			expect(parsed['callId']).toBe(`c${expected}`);
			expect(Object.keys(parsed['args'] as object)).toEqual([`n${expected}`]);
		});

		it.each([
			{ name: 'a very long reason', reason: 'x'.repeat(100_000) },
			{ name: 'a very long run of control characters', reason: '\n'.repeat(100_000) },
		])('caps $name after sanitising, so an escape is never cut in half', ({ reason }) => {
			const { lines, log } = make();
			log.record(entry({ outcome: 'denied', reason }));
			const written = parse(lines[0]!)['reason'] as string;
			expect(written.length).toBeLessThanOrEqual(300);
			expect(written).not.toMatch(/\\$/);
		});
	});
});
