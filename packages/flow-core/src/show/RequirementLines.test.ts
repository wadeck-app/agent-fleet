import type { FlowDefinition, FlowStep } from 'flow-engine/types';
import { describe, expect, it } from 'vitest';

import type { RunRequirementsRecord } from '../execution/ExecutionState.js';
import {
	executionRequirementLines,
	flowRequirementLines,
	stepRecordedRequirementLines,
	stepRequirementSuffix,
} from './RequirementLines.js';

const flowOf = (extra: Record<string, unknown>): FlowDefinition =>
	({ id: 'f', name: 'F', steps: [], ...extra }) as unknown as FlowDefinition;
const stepOf = (extra: Record<string, unknown>): FlowStep =>
	({ id: 's', type: 'script', script: 'x', ...extra }) as unknown as FlowStep;

const expand = (name: string): string[] | undefined =>
	({ agent: ['env=clean', 'fs=confined'], inspect: ['env=clean', 'fs=confined', 'fs=readonly-enforced'] })[name];

describe('flowRequirementLines', () => {
	it('prints nothing for a flow that declares neither', () => {
		expect(flowRequirementLines(flowOf({}), expand)).toEqual([]);
	});

	it('prints the declared requires and the profile with its expansion', () => {
		expect(flowRequirementLines(flowOf({ profile: 'agent', requires: ['sandbox'] }), expand)).toEqual([
			'profile:   agent',
			'requires:  sandbox',
			'expands:   agent = env=clean, fs=confined',
		]);
	});

	it('lists every profile used by a step once, sorted, aligned under the first', () => {
		const flow = flowOf({
			profile: 'agent',
			steps: [
				stepOf({ id: 'a', profile: 'inspect' }),
				stepOf({ id: 'b', profile: 'inspect' }),
				stepOf({ id: 'c' }),
			],
		});

		expect(flowRequirementLines(flow, expand)).toEqual([
			'profile:   agent',
			'expands:   agent = env=clean, fs=confined',
			'           inspect = env=clean, fs=confined, fs=readonly-enforced',
		]);
	});

	it('without an expander only the names are printed', () => {
		expect(flowRequirementLines(flowOf({ profile: 'agent' }))).toEqual(['profile:   agent']);
	});

	it('points to flow validate for a profile it cannot expand', () => {
		expect(flowRequirementLines(flowOf({ profile: 'agnt' }), expand)).toEqual([
			'profile:   agnt',
			'expands:   agnt = (unknown profile: run flow validate)',
		]);
	});
});

describe('stepRequirementSuffix', () => {
	it('is empty for a step with neither', () => {
		expect(stepRequirementSuffix(stepOf({}))).toBe('');
		expect(stepRequirementSuffix(stepOf({ requires: [] }))).toBe('');
	});

	it('shows the profile and the own requires', () => {
		expect(stepRequirementSuffix(stepOf({ profile: 'inspect', requires: ['gpu', 'sandbox'] }))).toBe(
			'  profile:inspect  requires:gpu,sandbox'
		);
	});
});

describe('stepRequirementSuffix - host marker', () => {
	it('shows host:true on a script step marked to run on the worker machine', () => {
		expect(stepRequirementSuffix(stepOf({ host: true }))).toBe('  host:true');
		expect(stepRequirementSuffix(stepOf({ profile: 'inspect', host: true }))).toBe('  profile:inspect  host:true');
	});

	it('shows nothing for host: false (the default) or without the field', () => {
		expect(stepRequirementSuffix(stepOf({ host: false }))).toBe('');
		expect(stepRequirementSuffix(stepOf({}))).toBe('');
	});

	it('does not show a malformed marker as if it were set', () => {
		expect(stepRequirementSuffix(stepOf({ host: 'true' }))).toBe('');
	});
});

describe('executionRequirementLines', () => {
	it('prints nothing for a record without requirements (older daemons, nothing required)', () => {
		expect(executionRequirementLines(undefined)).toEqual([]);
	});

	it('prints the profile name and the enforced run set', () => {
		const recorded: RunRequirementsRecord = {
			run: ['env=clean', 'fs=confined'],
			steps: {},
			profiles: { run: 'agent', steps: {} },
		};

		expect(executionRequirementLines(recorded)).toEqual(['Profile:   agent', 'Requires:  env=clean, fs=confined']);
	});

	it('prints only Requires for a record from step 1 (no profiles)', () => {
		expect(executionRequirementLines({ run: ['sandbox'], steps: {} })).toEqual(['Requires:  sandbox']);
	});

	it('prints nothing when the run set is empty and no profile is named', () => {
		expect(executionRequirementLines({ run: [], steps: { a: ['gpu'] } })).toEqual([]);
	});
});

describe('stepRecordedRequirementLines', () => {
	const recorded: RunRequirementsRecord = {
		run: ['env=clean'],
		steps: { same: ['env=clean'], more: ['env=clean', 'ports=private'] },
		profiles: { run: 'agent', steps: { more: 'untrusted-code' } },
	};

	it('prints nothing for a step whose set equals the run set and names no profile', () => {
		expect(stepRecordedRequirementLines(recorded, 'same', '      ')).toEqual([]);
	});

	it('prints the profile and the set of a step that differs from the run', () => {
		expect(stepRecordedRequirementLines(recorded, 'more', '      ')).toEqual([
			'      profile: untrusted-code',
			'      requires: env=clean, ports=private',
		]);
	});

	it('prints nothing for an injected step or a missing record', () => {
		expect(stepRecordedRequirementLines(recorded, 'injected', '      ')).toEqual([]);
		expect(stepRecordedRequirementLines(undefined, 'more', '      ')).toEqual([]);
	});
});
