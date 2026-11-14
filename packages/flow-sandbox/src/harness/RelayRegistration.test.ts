import { WORKER_FEATURE_HOST_TOOLS } from 'flow-cli/src/ipc/Protocol';
import { describe, expect, it } from 'vitest';

import { eachRow } from '../testing/EachRow';
import { RelayRegistration, type RelayRegistrationOptions } from './RelayRegistration';

const OPTIONS: RelayRegistrationOptions = {
	attachedProjectIds: ['1a2b3c4d'],
	attachedProjects: ['C:\\work\\app'],
	labels: ['sandbox', 'fast'],
	authToken: 'launch-token',
	sourceId: 'sbx-harness',
	pid: 4242,
	version: 'sandbox-harness',
};

describe('RelayRegistration', () => {
	it('declares exactly what the daemon needs to route to this worker', () => {
		expect(new RelayRegistration(OPTIONS).ready()).toEqual({
			type: 'ready',
			pid: 4242,
			version: 'sandbox-harness',
			authToken: 'launch-token',
			sourceId: 'sbx-harness',
			labels: ['sandbox', 'fast'],
			shellCapabilities: ['bash'],
			features: ['sub-step-session-resume', 'secrets', 'project-id'],
			attachedProjectIds: ['1a2b3c4d'],
			attachedProjects: ['C:\\work\\app'],
			hasUserInterface: false,
		});
	});

	// Slice 1: host tools run on the host worker only; the daemon routes a hostTools step by this list, so it must never name them.
	it('does not declare host-tools (the constant of flow-cli is not in the list)', () => {
		expect(new RelayRegistration(OPTIONS).ready()['features']).not.toContain(WORKER_FEATURE_HOST_TOOLS);
	});

	it('returns a new object each time (a caller cannot alter the registration)', () => {
		const registration = new RelayRegistration(OPTIONS);

		(registration.ready()['labels'] as string[]).push('evil');

		expect(registration.ready()['labels']).toEqual(['sandbox', 'fast']);
	});

	it('requires the sandbox label', () => {
		expect(() => new RelayRegistration({ ...OPTIONS, labels: ['fast'] })).toThrow('must include "sandbox"');
	});

	it('requires a project id and says how to get one', () => {
		expect(() => new RelayRegistration({ ...OPTIONS, attachedProjectIds: [] })).toThrow('--project-id');
	});

	it('requires (each case) and names the source command', () =>
		eachRow(
			[
				['authToken', { authToken: '' }],
				['sourceId', { sourceId: '' }],
			],
			(_name, override) => {
				expect(() => new RelayRegistration({ ...OPTIONS, ...override })).toThrow('built-in:command');
			}
		));
});
