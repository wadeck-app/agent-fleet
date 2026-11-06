import { describe, expect, it } from 'vitest';

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

	it.each([
		['authToken', { authToken: '' }],
		['sourceId', { sourceId: '' }],
	])('requires %s and names the source command', (_name, override) => {
		expect(() => new RelayRegistration({ ...OPTIONS, ...override })).toThrow('built-in:command');
	});
});
