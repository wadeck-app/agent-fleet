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

/** Declared sources by id; the fake answers like DeclaredGuarantees for the sets asked. */
function declared(bySource: Record<string, string[]>, unread: string[] = []) {
	return {
		providersOfAll: (required: readonly string[]) =>
			Object.entries(bySource)
				.filter(([, entries]) => required.every(entry => entries.includes(entry)))
				.map(([sourceId]) => sourceId),
		unread: () => unread,
	};
}

describe('ImplicitConfinement', () => {
	describe('a declared source covers the agent set', () => {
		const confinement = new ImplicitConfinement(declared({ sbx: [...AGENT, 'sandbox'] }));

		it('adds the set to each model step and warns about nothing', () => {
			const { requirements, warnings } = confinement.resolve(flow([model('m'), script('s')]));

			expect(requirements?.steps).toEqual({ m: AGENT, s: [] });
			expect(requirements?.implicit).toEqual({ requires: AGENT, steps: ['m'] });
			expect(warnings).toEqual([]);
		});

		it('adds nothing to a step that already requires the agent set', () => {
			const { requirements } = confinement.resolve(flow([model('m', { profile: 'agent' })]));

			expect(requirements?.implicit).toBeUndefined();
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

	it('treats a daemon without source knowledge as having no covering source: the warning, never silence', () => {
		const { warnings } = new ImplicitConfinement(undefined).resolve(flow([model('m')]));

		expect(warnings).toHaveLength(1);
	});
});
