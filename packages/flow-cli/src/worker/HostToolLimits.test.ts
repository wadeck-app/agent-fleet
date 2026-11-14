import type { HostTool } from 'flow-engine';
import { describe, expect, it } from 'vitest';

import { HostToolLimits } from './HostToolLimits';

const BASE: HostTool = {
	id: 'queue-task-show',
	description: 'd',
	sideEffect: 'read',
	command: ['task', 'show'],
};

describe('HostToolLimits.resolve - defaults are applied here, never stored in the definition', () => {
	it('applies every default to a tool that sets nothing', () => {
		expect(HostToolLimits.resolve(BASE)).toEqual({
			cwd: 'workspace',
			timeoutSeconds: 30,
			maxOutputBytes: 65_536,
			concurrency: 2,
			maxCallsPerStep: 100,
		});
	});

	it('exposes the defaults for display', () => {
		expect(HostToolLimits.DEFAULTS).toEqual({
			cwd: 'workspace',
			timeoutSeconds: 30,
			maxOutputBytes: 65_536,
			concurrency: 2,
			maxCallsPerStep: 100,
		});
	});

	it.each([
		['cwd', { cwd: 'none' as const }, { cwd: 'none' }],
		['timeoutSeconds', { timeoutSeconds: 300 }, { timeoutSeconds: 300 }],
		['maxOutputBytes', { maxOutputBytes: 1_048_576 }, { maxOutputBytes: 1_048_576 }],
		[
			'all three',
			{ cwd: 'none' as const, timeoutSeconds: 5, maxOutputBytes: 10 },
			{ cwd: 'none', timeoutSeconds: 5, maxOutputBytes: 10 },
		],
	])('keeps what the tool wrote: %s', (_label, written, expected) => {
		expect(HostToolLimits.resolve({ ...BASE, ...written })).toMatchObject(expected);
	});

	it('does not change the tool it resolves', () => {
		const tool = { ...BASE };
		HostToolLimits.resolve(tool);
		expect(tool).toEqual(BASE);
	});

	it('keeps concurrency and the call cap fixed (not configurable per tool in slice 1)', () => {
		const resolved = HostToolLimits.resolve({ ...BASE, timeoutSeconds: 5 });
		expect(resolved.concurrency).toBe(2);
		expect(resolved.maxCallsPerStep).toBe(100);
	});

	it.each([
		['a timeout of 0', { timeoutSeconds: 0 }],
		['a timeout above the maximum', { timeoutSeconds: 301 }],
		['a fractional timeout', { timeoutSeconds: 1.5 }],
		['an output cap above the maximum', { maxOutputBytes: 1_048_577 }],
		['a negative output cap', { maxOutputBytes: -1 }],
	])('fails loudly for %s (validation should have refused it)', (_label, written) => {
		expect(() => HostToolLimits.resolve({ ...BASE, ...written })).toThrow(/queue-task-show/);
	});
});

describe('HostToolLimits.describe', () => {
	it('renders the applied values, marking what is a default', () => {
		expect(HostToolLimits.describe({ ...BASE, timeoutSeconds: 5 })).toBe(
			'cwd=workspace (default), timeout=5s, output<=65536 bytes (default)'
		);
		expect(HostToolLimits.describe({ ...BASE, cwd: 'none', maxOutputBytes: 100 })).toBe(
			'cwd=none, timeout=30s (default), output<=100 bytes'
		);
	});
});
