import { describe, expect, it } from 'vitest';

import { eachRow } from '../testing/EachRow';
import { DaemonFrameFit } from './DaemonFrameFit';
import type { JsonObject } from './HarnessMessages';

const LIMIT = 1024 * 1024;
const HEADER = { assignmentId: 'as1', executionId: 'run1', stepId: 's1' };
const BIG = 'x'.repeat(LIMIT + 1000);

function bytes(message: JsonObject): number {
	return Buffer.byteLength(JSON.stringify(message), 'utf8');
}

describe('DaemonFrameFit (the same shrinking as flow-cli Worker.ts)', () => {
	it('returns a frame that fits unchanged', () => {
		const message = { type: 'step_completed', ...HEADER, output: { a: 1 } };
		expect(DaemonFrameFit.fit(message, new Set())).toBe(message);
	});

	it('cuts diagnostics and undeclared outputs of a step_completed, marks them, never cuts a declared output', () => {
		const message = {
			type: 'step_completed',
			...HEADER,
			output: { stdout: BIG, answer: 'kept' },
			io: { stdout: BIG },
		};

		const fitted = DaemonFrameFit.fit(message, new Set(['answer']));

		expect(bytes(fitted)).toBeLessThanOrEqual(LIMIT);
		expect(fitted['type']).toBe('step_completed');
		expect((fitted['output'] as JsonObject)['answer']).toBe('kept');
		expect((fitted['truncated'] as JsonObject[]).map(cut => cut['field'])).toContain('io.stdout');
	});

	it('fits an oversized frame like flow does, or fails the step for good (each case)', () =>
		eachRow(
			[
				{
					label: 'a declared output that cannot fit fails the step for good, keeping the attempt cost',
					message: { type: 'step_completed', ...HEADER, output: { answer: BIG }, meta: { cost: 3 } },
					declared: ['answer'],
					expected: { type: 'step_failed', stepId: 's1', origin: 'engine', meta: { cost: 3 } },
				},
				{
					label: 'an oversized step_failed keeps its error and drops the rest',
					message: { type: 'step_failed', ...HEADER, error: 'boom', stdout: BIG },
					declared: [],
					expected: { type: 'step_failed', stepId: 's1' },
				},
			],
			({ message, declared, expected }) => {
				const fitted = DaemonFrameFit.fit(message, new Set(declared));

				expect(bytes(fitted)).toBeLessThanOrEqual(LIMIT);
				expect(fitted).toMatchObject(expected);
				expect(String(fitted['error'])).toContain(declared.length > 0 ? 'cannot be sent' : 'boom');
			}
		));

	it('throws, naming the type and the limit, for any other oversized frame', () => {
		expect(() => DaemonFrameFit.fit({ type: 'ready', pad: BIG }, new Set())).toThrow(
			/ready.*at most 1048576 bytes/
		);
	});
});
