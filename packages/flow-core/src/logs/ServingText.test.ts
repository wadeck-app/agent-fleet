import { describe, expect, it } from 'vitest';

import type { ExecutionState } from '../execution/ExecutionState.js';
import { stripErrorsForServing, stripForServing, stripRecordForServing } from './ServingText.js';

const ESC = '\u001b';

describe('stripForServing', () => {
	it('strips terminal control and progress overwrites', () => {
		expect(stripForServing(`${ESC}[36mbuild${ESC}[0m\n10%\r100%\n`)).toBe('build\n100%\n');
	});

	it('returns plain text unchanged', () => {
		expect(stripForServing('3 tests passed')).toBe('3 tests passed');
	});

	it('does not guess secrets: text that looks like one is served as stored', () => {
		expect(stripForServing(`${ESC}[1mAPI_KEY${ESC}[0m=abc123def\npassword=hunter22`)).toBe(
			'API_KEY=abc123def\npassword=hunter22'
		);
	});

	it.each(['', '\u0000\u0001', ESC, '\ud800', '{"unclosed": "', 'a'.repeat(10)])(
		'never throws on odd input %j',
		input => {
			expect(() => stripForServing(input)).not.toThrow();
		}
	);
});

const RECORD: ExecutionState = {
	executionId: 'exec-1',
	flowFile: '/flows/a.yml',
	flowId: 'a',
	status: 'failed',
	currentSteps: [],
	startedAt: '2026-08-16T12:00:00.000Z',
	completedAt: '2026-08-16T12:01:00.000Z',
	lastError: `${ESC}[31mpush rejected${ESC}[0m`,
	steps: {
		build: {
			status: 'failed',
			error: `${ESC}[31mfailed${ESC}[0m`,
			stdout: `${ESC}[32mok${ESC}[0m\nPASSWORD=left-as-stored`,
			stderr: 'nothing special',
			relaunches: [{ at: '2026-08-16T12:00:30.000Z', feedback: `${ESC}[33mretry${ESC}[0m` }],
		},
		wait: { status: 'pending' },
	},
};

describe('stripErrorsForServing', () => {
	it('strips only the error texts of a record: lastError and the error of each step', () => {
		const served = stripErrorsForServing({
			...RECORD,
			steps: { build: { status: 'failed', error: `${ESC}[31mboom${ESC}[0m`, stdout: `${ESC}[32mleft${ESC}[0m` } },
		});

		expect(served.lastError).toBe('push rejected');
		expect(served.steps['build']).toEqual({ status: 'failed', error: 'boom', stdout: `${ESC}[32mleft${ESC}[0m` });
	});
});

describe('stripRecordForServing', () => {
	it('strips the error, outputs and feedback of every step in a copy, leaving the stored record untouched', () => {
		const before = JSON.stringify(RECORD);
		const served = stripRecordForServing(RECORD);

		expect(served.lastError).toBe('push rejected');
		expect(served.steps['build']).toMatchObject({
			error: 'failed',
			stdout: 'ok\nPASSWORD=left-as-stored',
			stderr: 'nothing special',
			relaunches: [{ at: '2026-08-16T12:00:30.000Z', feedback: 'retry' }],
		});
		expect(served.steps['wait']).toEqual({ status: 'pending' });
		expect(JSON.stringify(RECORD)).toBe(before);
	});

	it('keeps a record without error or step outputs as it is', () => {
		const plain: ExecutionState = { ...RECORD, lastError: undefined, steps: { a: { status: 'completed' } } };

		expect(stripRecordForServing(plain).steps).toEqual({ a: { status: 'completed' } });
		expect(stripRecordForServing(plain).lastError).toBeUndefined();
	});
});

describe('stripRecordForServing: recorded io', () => {
	const value = (text: string) => ({ text, truncated: false, chars: text.length });
	const withIo: ExecutionState = {
		...RECORD,
		steps: {
			a: {
				status: 'completed',
				io: {
					inputs: { prompt: value(`${ESC}[31mred${ESC}[0m`) },
					outputs: { out: value(`${ESC}[1mbold${ESC}[0m`) },
					stdout: value(`${ESC}[36mcyan${ESC}[0m\n10%\r100%\n`),
					stderr: value(`${ESC}[33mwarn${ESC}[0m`),
					truncated: false,
					storedChars: 30,
				},
			},
		},
	};

	it('strips terminal control from every recorded text in a copy, keeping the lengths of the originals', () => {
		const before = JSON.stringify(withIo);
		const io = stripRecordForServing(withIo).steps['a']!.io!;

		expect(io.inputs['prompt']).toEqual({ text: 'red', truncated: false, chars: 12 });
		expect(io.outputs['out']?.text).toBe('bold');
		expect(io.stdout?.text).toBe('cyan\n100%\n');
		expect(io.stderr?.text).toBe('warn');
		expect(JSON.stringify(withIo)).toBe(before);
	});

	it('leaves the recorded texts alone when only the errors are served', () => {
		expect(stripErrorsForServing(withIo).steps['a']!.io).toEqual(withIo.steps['a']!.io);
	});
});
