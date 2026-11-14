import type { FlowDefinition } from 'flow-engine';
import { describe, expect, it } from 'vitest';

import { ImplicitConfinement } from './ImplicitConfinement.js';

const AGENT = ['env=clean', 'fs=confined'];

function flow(steps: Record<string, unknown>[], extra: Record<string, unknown> = {}): FlowDefinition {
	return { id: 'f', version: '1.0.0', name: 'F', steps, ...extra } as unknown as FlowDefinition;
}
const model = (id: string, extra: Record<string, unknown> = {}) => ({
	type: 'model',
	id,
	name: id,
	prompt: 'hi',
	...extra,
});
const script = (id: string, extra: Record<string, unknown> = {}) => ({
	type: 'script',
	id,
	name: id,
	script: 'true',
	...extra,
});

/**
 * Declared sources by id; the fake answers like DeclaredGuarantees for the sets asked.
 * @param restricted the projects of the sources that declare a projects restriction (the others serve every project)
 */
function declared(bySource: Record<string, string[]>, unread: string[] = [], restricted: Record<string, string[]> = {}) {
	return {
		providersOfAllForProject: (required: readonly string[], projectId: string | undefined) => {
			const providers = Object.entries(bySource)
				.filter(([, entries]) => required.every(entry => entries.includes(entry)))
				.map(([sourceId]) => sourceId);
			const serves = (sourceId: string): boolean => {
				const projects = restricted[sourceId];
				if (projectId === undefined) {
					return Object.keys(restricted).length === 0;
				}
				return projects === undefined || projects.includes(projectId);
			};
			return { serving: providers.filter(serves), elsewhere: providers.filter(sourceId => !serves(sourceId)) };
		},
		unread: () => unread,
	};
}

describe('ImplicitConfinement', () => {
	describe('implicitSetFor', () => {
		it('is the agent set when a source serves the project', () => {
			const confinement = new ImplicitConfinement(declared({ sbx: AGENT }, [], { sbx: ['p1'] }));
			expect(confinement.implicitSetFor('p1')).toEqual(AGENT);
		});

		it('is empty when the only covering source serves other projects, or none is declared', () => {
			expect(new ImplicitConfinement(declared({ sbx: AGENT }, [], { sbx: ['p1'] })).implicitSetFor('p2')).toEqual([]);
			expect(new ImplicitConfinement(undefined).implicitSetFor('p1')).toEqual([]);
		});
	});

	describe('a declared source covers the agent set', () => {
		const confinement = new ImplicitConfinement(declared({ sbx: [...AGENT, 'sandbox'] }));

		it('adds the set to each model step and warns about nothing', () => {
			const { requirements, warnings } = confinement.resolve(flow([model('m'), script('s')]));

			expect(requirements?.steps).toEqual({ m: AGENT, s: [] });
			expect(requirements?.implicit).toEqual({ requires: AGENT, steps: ['m'] });
			expect(warnings).toEqual([]);
		});

			it('adds nothing to a step that already requires the agent set, but records the set for the steps injected later', () => {
			const { requirements } = confinement.resolve(flow([model('m', { profile: 'agent' })]));

			expect(requirements?.implicit).toEqual({ requires: AGENT, steps: [] });
		});
	});

	describe('no declared source covers the agent set', () => {
		it.each([
			['no source at all', {}],
			['a source that guarantees only part of the set', { half: ['fs=confined'] }],
			['a source that guarantees the other half', { other: ['env=clean'] }],
			[
				'two sources that each guarantee half (a step runs on one worker)',
				{ a: ['fs=confined'], b: ['env=clean'] },
			],
		])('adds nothing and warns once per model step: %s', (_name, sources) => {
			const { requirements, warnings } = new ImplicitConfinement(declared(sources)).resolve(
				flow([model('first'), script('s'), model('second')])
			);

			expect(requirements).toBeUndefined();
			expect(warnings).toEqual([
				'model step first runs unconfined: no worker source guarantees env=clean and fs=confined; declare a sandbox source (flow worker source list) or write profile: agent to require it',
				'model step second runs unconfined: no worker source guarantees env=clean and fs=confined; declare a sandbox source (flow worker source list) or write profile: agent to require it',
			]);
		});

		it('does not warn for a model step that requires the agent set itself (the run is confined or refused)', () => {
			const { warnings } = new ImplicitConfinement(declared({})).resolve(
				flow([model('explicit', { profile: 'agent' }), model('bare')])
			);

			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('model step bare');
		});

		it('does not warn for a flow without model step', () => {
			expect(new ImplicitConfinement(declared({})).resolve(flow([script('s')])).warnings).toEqual([]);
		});

		it('names the sources whose declaration could not be read, since they may be the covering one', () => {
			const { warnings } = new ImplicitConfinement(declared({}, ['sbx'])).resolve(flow([model('m')]));

			expect(warnings[0]).toContain('model step m runs unconfined');
			expect(warnings[0]).toContain('sbx');
			expect(warnings[0]).toMatch(/could not be read/);
		});

		it('keeps what the flow itself requires', () => {
			const { requirements } = new ImplicitConfinement(declared({})).resolve(
				flow([model('m')], { requires: ['gpu'] })
			);

			expect(requirements).toEqual({ run: ['gpu'], steps: { m: ['gpu'] } });
		});
	});

	describe('the covering source serves only some projects', () => {
		const sources = { sbx: [...AGENT, 'sandbox'] };
		const restricted = { sbx: ['test-tasks'] };
		const confinement = new ImplicitConfinement(declared(sources, [], restricted));

		it('confines the model steps of a project it serves', () => {
			const { requirements, warnings } = confinement.resolve(flow([model('m')]), 'test-tasks');

			expect(requirements?.steps).toEqual({ m: AGENT });
			expect(requirements?.implicit).toEqual({ requires: AGENT, steps: ['m'] });
			expect(warnings).toEqual([]);
		});

		it('leaves the model steps of another project unrequired, with a warning that says why', () => {
			const { requirements, warnings } = confinement.resolve(flow([model('m')]), 'test-flow');

			expect(requirements).toBeUndefined();
			expect(warnings).toEqual([
				'model step m runs unconfined: no worker source serving project test-flow guarantees env=clean and fs=confined (sbx does, but serves other projects); declare a sandbox source for this project (flow worker source list) or write profile: agent to require it',
			]);
		});

		it('names every source that serves other projects', () => {
			const { warnings } = new ImplicitConfinement(
				declared({ a: AGENT, b: AGENT }, [], { a: ['x'], b: ['y'] })
			).resolve(flow([model('m')]), 'z');

			expect(warnings[0]).toContain('(a, b do, but serve other projects)');
		});

		it('keeps the explicit profile of a step, whatever the project', () => {
			const { requirements, warnings } = confinement.resolve(flow([model('m', { profile: 'agent' })]), 'test-flow');

			expect(requirements?.steps).toEqual({ m: AGENT });
			expect(warnings).toEqual([]);
		});

		it('does not cover a run without a project id (a source restricts its projects)', () => {
			const { requirements, warnings } = confinement.resolve(flow([model('m')]));

			expect(requirements).toBeUndefined();
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('(sbx does, but serves other projects)');
		});
	});

	describe('a covering source without a projects restriction', () => {
		const confinement = new ImplicitConfinement(declared({ sbx: AGENT }));

		it.each([['any-project'], [undefined]])('covers every run, project id %s', projectId => {
			const { requirements, warnings } = confinement.resolve(flow([model('m')]), projectId);

			expect(requirements?.steps).toEqual({ m: AGENT });
			expect(warnings).toEqual([]);
		});
	});

	describe('a mixed machine', () => {
		const confinement = new ImplicitConfinement(declared({ mine: AGENT, theirs: AGENT }, [], { mine: ['a'], theirs: ['b'] }));

		it('covers the project one of the sources serves, not the others', () => {
			expect(confinement.resolve(flow([model('m')]), 'a').requirements?.steps).toEqual({ m: AGENT });
			expect(confinement.resolve(flow([model('m')]), 'b').requirements?.steps).toEqual({ m: AGENT });
			expect(confinement.resolve(flow([model('m')]), 'c').requirements).toBeUndefined();
		});
	});

	it('treats a daemon without source knowledge as having no covering source: the warning, never silence', () => {
		const { warnings } = new ImplicitConfinement(undefined).resolve(flow([model('m')]));

		expect(warnings).toHaveLength(1);
	});
});
