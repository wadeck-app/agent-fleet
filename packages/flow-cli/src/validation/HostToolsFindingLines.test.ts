import type { HostToolsConfinementPolicy } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/types';
import { describe, expect, it, vi } from 'vitest';

import { HostToolsFindingLines } from './HostToolsFindingLines';

const WARN: HostToolsConfinementPolicy = {
	mode: 'warn',
	description: 'warning (validation.hostToolsUnderConfinedProfile=warn, default)',
};
const ERROR: HostToolsConfinementPolicy = {
	mode: 'error',
	description: 'error (validation.hostToolsUnderConfinedProfile=error)',
};

const TOOLS = [{ id: 't', description: 'd', sideEffect: 'read', command: ['task'] }];

const flowOf = (extra: Record<string, unknown>, stepExtra: Record<string, unknown> = {}): FlowDefinition =>
	({
		id: 'f',
		name: 'F',
		workspace: 'in-place',
		...extra,
		steps: [{ id: 'triage', type: 'model', prompt: 'p', hostTools: TOOLS, ...stepExtra }],
	}) as unknown as FlowDefinition;

describe('HostToolsFindingLines', () => {
	// [name, flow, policy, expected line prefix and fragments]
	it.each([
		{
			name: 'a warning with the default-mode description under a confined profile',
			flow: flowOf({ profile: 'agent' }),
			policy: WARN,
			expected: [
				'warning: ',
				"Step 'triage' declares hostTools under a confined profile",
				'Mode: warning (validation.hostToolsUnderConfinedProfile=warn, default)',
			],
		},
		{
			name: 'an error when the setting says error',
			flow: flowOf({ profile: 'hermetic-test' }),
			policy: ERROR,
			expected: ['error: ', 'Mode: error (validation.hostToolsUnderConfinedProfile=error)'],
		},
		{
			name: 'a step-level requires: [fs=confined]',
			flow: flowOf({}, { requires: ['fs=confined'] }),
			policy: WARN,
			expected: ['warning: ', 'requires'],
		},
	])('prints $name', ({ flow, policy, expected }) => {
		const lines = HostToolsFindingLines.of(flow, () => policy);

		expect(lines).toHaveLength(1);
		for (const fragment of expected) expect(lines[0]).toContain(fragment);
	});

	it('prints nothing for hostTools without any confinement', () => {
		expect(HostToolsFindingLines.of(flowOf({}), () => WARN)).toEqual([]);
	});

	it('prints nothing, and does not read the setting, for a flow without hostTools (a broken configuration must not break `flow show` of an unrelated flow)', () => {
		const policy = vi.fn(() => WARN);

		expect(HostToolsFindingLines.of(flowOf({ profile: 'agent' }, { hostTools: undefined }), policy)).toEqual([]);
		expect(policy).not.toHaveBeenCalled();
	});

	it('lets the error of an invalid user setting through (no silent default)', () => {
		expect(() =>
			HostToolsFindingLines.of(flowOf({ profile: 'agent' }), () => {
				throw new Error('validation.hostToolsUnderConfinedProfile in "x" must be one of warn | error');
			})
		).toThrow(/must be one of warn \| error/);
	});
});
