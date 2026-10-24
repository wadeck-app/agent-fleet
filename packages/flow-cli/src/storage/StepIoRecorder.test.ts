import { describe, expect, it } from 'vitest';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { SecretMasker } from '../secrets/SecretMasker';
import { DEFAULT_IO_LIMITS, StepIoRecorder } from './StepIoRecorder';

const EXECUTION = 'abc12345';
// Built at runtime from parts: a literal would trip secret scanners.
const SECRET = ['tk', '_Zq81', 'Lm4Xw', '9Pv'].join('');

function recorder(limits = DEFAULT_IO_LIMITS, secret: string | undefined = undefined): StepIoRecorder {
	const masks = new ExecutionMasks();
	if (secret !== undefined) {
		masks.register(EXECUTION, new SecretMasker(new Map([['API_TOKEN', secret]])));
	}
	return new StepIoRecorder((id, text) => masks.mask(id, text), limits);
}

const record = (
	r: StepIoRecorder,
	capture: Parameters<StepIoRecorder['record']>[0]['capture'],
	outputs = {},
	usedByOthers = 0
) => r.record({ executionId: EXECUTION, capture, outputs, usedByOthers });

describe('StepIoRecorder', () => {
	it('stores short values whole and says nothing was cut', () => {
		const io = record(recorder(), { inputs: { 'inputs.task': 'fix it' }, stdout: 'ok\n' }, { plan: 'one' });

		expect(io.inputs['inputs.task']).toEqual({ text: 'fix it', truncated: false, chars: 6 });
		expect(io.outputs['plan']).toEqual({ text: 'one', truncated: false, chars: 3 });
		expect(io.stdout).toEqual({ text: 'ok\n', truncated: false, chars: 3 });
		expect(io.stderr).toBeUndefined();
		expect(io.truncated).toBe(false);
	});

	it('writes non-string outputs as JSON text', () => {
		const io = record(recorder(), undefined, { passed: true, files: ['a', 'b'], n: 3 });

		expect(io.outputs['passed']?.text).toBe('true');
		expect(io.outputs['files']?.text).toBe('["a","b"]');
		expect(io.outputs['n']?.text).toBe('3');
	});

	it('cuts a long input or output at the per-value cap, keeping the head, with the original length', () => {
		const long = 'h'.repeat(DEFAULT_IO_LIMITS.perValue) + 'END';
		const io = record(recorder(), { inputs: { prompt: long } }, { big: long });

		for (const value of [io.inputs['prompt']!, io.outputs['big']!]) {
			expect(value.truncated).toBe(true);
			expect(value.chars).toBe(DEFAULT_IO_LIMITS.perValue + 3);
			expect(value.text).toHaveLength(DEFAULT_IO_LIMITS.perValue);
			expect(value.text.endsWith('END')).toBe(false);
		}
		expect(io.truncated).toBe(true);
	});

	it('keeps the tail of stdout and stderr', () => {
		const long = 'x'.repeat(DEFAULT_IO_LIMITS.perValue) + 'END';
		const io = record(recorder(), { inputs: {}, stdout: long, stderr: long });

		expect(io.stdout?.text.endsWith('END')).toBe(true);
		expect(io.stdout?.text).toHaveLength(DEFAULT_IO_LIMITS.perValue);
		expect(io.stderr?.truncated).toBe(true);
		expect(io.stdout?.chars).toBe(DEFAULT_IO_LIMITS.perValue + 3);
	});

	it('stays under the per-step cap and records the values past it as empty and truncated, never dropped', () => {
		const outputs = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`o${String(i)}`, 'v'.repeat(4000)]));
		const io = record(recorder(), undefined, outputs);

		expect(io.storedChars).toBeLessThanOrEqual(DEFAULT_IO_LIMITS.perStep);
		expect(Object.keys(io.outputs)).toHaveLength(12);
		const last = io.outputs['o11']!;
		expect(last).toEqual({ text: '', truncated: true, chars: 4000 });
		expect(io.truncated).toBe(true);
	});

	it('stays under what is left of the per-execution cap', () => {
		const io = record(recorder(), { inputs: {} }, { a: 'v'.repeat(3000) }, DEFAULT_IO_LIMITS.perExecution - 100);

		expect(io.outputs['a']?.text.length).toBeLessThanOrEqual(100);
		expect(io.outputs['a']?.chars).toBe(3000);
		expect(io.outputs['a']?.truncated).toBe(true);
	});

	it('records everything as empty once the execution budget is spent', () => {
		const io = record(
			recorder(),
			{ inputs: { x: 'abc' }, stdout: 'out' },
			{ a: 'def' },
			DEFAULT_IO_LIMITS.perExecution
		);

		expect(io.inputs['x']).toEqual({ text: '', truncated: true, chars: 3 });
		expect(io.outputs['a']).toEqual({ text: '', truncated: true, chars: 3 });
		expect(io.stdout).toEqual({ text: '', truncated: true, chars: 3 });
	});

	it('records the outputs even when the worker sent no capture', () => {
		const io = record(recorder(), undefined, { a: 'x' });

		expect(io.inputs).toEqual({});
		expect(io.outputs['a']?.text).toBe('x');
	});

	describe('secrets', () => {
		it('masks every text, keeping the placeholder', () => {
			const io = record(
				recorder(DEFAULT_IO_LIMITS, SECRET),
				{ inputs: { 'env.TOKEN': `Bearer ${SECRET}` }, stdout: `got ${SECRET}`, stderr: SECRET },
				{ echoed: SECRET }
			);

			expect(io.inputs['env.TOKEN']?.text).toBe('Bearer [secret:API_TOKEN]');
			expect(io.stdout?.text).toBe('got [secret:API_TOKEN]');
			expect(io.stderr?.text).toBe('[secret:API_TOKEN]');
			expect(io.outputs['echoed']?.text).toBe('[secret:API_TOKEN]');
			expect(JSON.stringify(io)).not.toContain(SECRET);
		});

		it('masks BEFORE cutting: a secret straddling the head cut cannot leak a prefix', () => {
			const raw = 'a'.repeat(DEFAULT_IO_LIMITS.perValue - 6) + SECRET + 'tail';
			// Sanity: cutting the raw text first WOULD leave the first 6 characters of the secret.
			expect(raw.slice(0, DEFAULT_IO_LIMITS.perValue)).toContain(SECRET.slice(0, 6));

			const io = record(recorder(DEFAULT_IO_LIMITS, SECRET), { inputs: { prompt: raw } }, { out: raw });

			for (const value of [io.inputs['prompt']!, io.outputs['out']!]) {
				expect(value.truncated).toBe(true);
				expect(value.text).not.toContain(SECRET.slice(0, 6));
			}
		});

		it('masks BEFORE cutting: a secret straddling the tail cut cannot leak a suffix', () => {
			const raw = 'head' + SECRET + 'b'.repeat(DEFAULT_IO_LIMITS.perValue - 6);
			expect(raw.slice(-DEFAULT_IO_LIMITS.perValue)).toContain(SECRET.slice(-6));

			const io = record(recorder(DEFAULT_IO_LIMITS, SECRET), { inputs: {}, stdout: raw });

			expect(io.stdout?.truncated).toBe(true);
			expect(io.stdout?.text).not.toContain(SECRET.slice(-6));
		});

		it('reports the original length after masking, not before', () => {
			const io = record(recorder(DEFAULT_IO_LIMITS, SECRET), { inputs: { a: SECRET } });

			expect(io.inputs['a']?.chars).toBe('[secret:API_TOKEN]'.length);
		});
	});
});
