import type { RunRequirementsRecord } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { ProjectRequirementCheck } from './ProjectRequirementCheck.js';

interface Source {
	guarantees: string[];
	/** Undefined: serves every project. */
	projects?: string[];
}

function check(sources: Record<string, Source>, unread: string[] = []) {
	const providers = (required: readonly string[]) =>
		Object.entries(sources)
			.filter(([, source]) => required.every(entry => source.guarantees.includes(entry)))
			.map(([sourceId]) => sourceId);
	return new ProjectRequirementCheck({
		providersOfAllForProject: (required, projectId) => {
			const all = providers(required);
			const serves = (sourceId: string) => {
				const projects = sources[sourceId]!.projects;
				return projects === undefined || (projectId !== undefined && projects.includes(projectId));
			};
			return { serving: all.filter(serves), elsewhere: all.filter(id => !serves(id)) };
		},
		projectsOf: sourceId => sources[sourceId]?.projects,
		unread: () => unread,
	});
}

const AGENT = ['env=clean', 'fs=confined'];
const record = (overrides: Partial<RunRequirementsRecord> = {}): RunRequirementsRecord => ({
	run: [],
	steps: { build: AGENT },
	...overrides,
});

describe('ProjectRequirementCheck', () => {
	it('lets a run through when nothing is required', () => {
		expect(check({}).check('flow', 'p1', undefined)).toBeUndefined();
	});

	it('lets a run through when a source serving the project guarantees the set', () => {
		const sources = { sbx: { guarantees: AGENT, projects: ['p1'] } };

		expect(check(sources).check('flow', 'p1', record())).toBeUndefined();
	});

	it('lets a run through when the source declares no projects (unscoped: unchanged)', () => {
		expect(check({ sbx: { guarantees: AGENT } }).check('flow', 'p1', record())).toBeUndefined();
	});

	it('leaves "no source provides it at all" to the existing messages', () => {
		expect(
			check({ sbx: { guarantees: ['sandbox'], projects: ['p2'] } }).check('flow', 'p1', record())
		).toBeUndefined();
	});

	it('refuses when only sources serving other projects guarantee the set, naming profile, project, sources and the fixes', () => {
		const sources = { sbx: { guarantees: AGENT, projects: ['p2', 'p3'] } };

		const message = check(sources).check(
			'flow',
			'p1',
			record({ run: AGENT, profiles: { run: 'agent', steps: {} } })
		);

		expect(message).toContain('Flow "flow" requires env=clean, fs=confined (profile: agent)');
		expect(message).toContain('project p1');
		expect(message).toContain('sbx (serves projects: p2, p3)');
		expect(message).toContain('--option projects=');
		expect(message).toContain('remove the requirement');
	});

	it('names the step and its own profile for a step requirement', () => {
		const sources = { sbx: { guarantees: AGENT, projects: ['p2'] } };

		const message = check(sources).check('flow', 'p1', record({ profiles: { steps: { build: 'agent' } } }));

		expect(message).toContain('Step "build" of flow "flow" requires env=clean, fs=confined (profile: agent)');
	});

	it('does not refuse while a declared source is unread: it may be the one that serves the project', () => {
		const sources = { sbx: { guarantees: AGENT, projects: ['p2'] } };

		expect(check(sources, ['other']).check('flow', 'p1', record())).toBeUndefined();
	});

	it('checks each distinct set once and ignores a step without requirements', () => {
		const sources = { sbx: { guarantees: AGENT, projects: ['p2'] } };

		const message = check(sources).check(
			'flow',
			'p1',
			record({ run: AGENT, steps: { a: AGENT, b: AGENT, c: [] } })
		);

		expect(message).toContain('Flow "flow"');
		expect(message).not.toContain('Step "c"');
	});
});
