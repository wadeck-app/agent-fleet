import type { StepPlacement } from 'extension-points';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { type RoutingCandidate, StepRouter } from './StepRouter.js';

function candidate(workerId: string, sourceId: string | undefined): RoutingCandidate {
	return {
		ws: { workerId } as unknown as WebSocket,
		worker: {
			state: 'idle',
			workerId,
			pid: 1,
			labels: [],
			attachedProjects: [],
			attachedProjectIds: [],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [],
			features: [],
			...(sourceId === undefined ? {} : { sourceId }),
		},
	};
}

const step = (overrides: Partial<StepPlacement> = {}): StepPlacement => ({
	stepId: 's1',
	labels: [],
	requiresUserInterface: false,
	...overrides,
});

// Both sources guarantee `sandbox`; they differ by the workspace kinds they accept.
const GUARANTEES: Record<string, string[]> = { poolbox: ['sandbox'], openbox: ['sandbox'], host: [] };
const WORKSPACES: Record<string, string[] | undefined> = { poolbox: ['pool'], openbox: undefined, host: undefined };
const catalog = {
	typeLookup: () => () => undefined,
	requirementOnlyLookup: () => () => false,
	guaranteeLookup: () => (sourceId: string | undefined) =>
		sourceId === undefined ? [] : (GUARANTEES[sourceId] ?? []),
	workspaceLookup: () => (sourceId: string | undefined) =>
		sourceId === undefined ? undefined : WORKSPACES[sourceId],
};

let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
	stderr.mockRestore();
});

describe('StepRouter - workspace kind (hard filter next to the requirements)', () => {
	const poolbox = candidate('w-pool', 'poolbox');
	const openbox = candidate('w-open', 'openbox');

	it('does not place a step on a source that does not accept the kind of its run, even if it guarantees the requirement', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(router.select(step({ requires: ['sandbox'], workspaceKind: 'in-place' }), [poolbox])).toBeUndefined();
	});

	it('places it on the source that accepts the kind when an accepting and a non-accepting source both guarantee the requirement', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(router.select(step({ requires: ['sandbox'], workspaceKind: 'pool' }), [openbox, poolbox])).toBe(
			openbox.ws
		);
		expect(router.select(step({ requires: ['sandbox'], workspaceKind: 'in-place' }), [poolbox, openbox])).toBe(
			openbox.ws
		);
	});

	it('accepts a listed kind', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(router.select(step({ requires: ['sandbox'], workspaceKind: 'pool' }), [poolbox])).toBe(poolbox.ws);
	});

	it('fails closed when the kind of the run is unknown and the source is restricted', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(router.select(step({ requires: ['sandbox'] }), [poolbox])).toBeUndefined();
		expect(router.select(step({ requires: ['sandbox'] }), [poolbox, openbox])).toBe(openbox.ws);
	});

	it('leaves a step that requires nothing alone, as before', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(
			router.select(step({ workspaceKind: 'in-place' }), [candidate('w-host', 'host'), poolbox])
		).toBeDefined();
	});

	it('fails closed, saying why on stderr, when the workspace kinds of the sources cannot be read', () => {
		const router = new StepRouter(undefined, undefined, {
			...catalog,
			workspaceLookup: () => {
				throw new Error('registry unreadable');
			},
		});

		expect(
			router.select(step({ requires: ['sandbox'], workspaceKind: 'pool' }), [poolbox, openbox])
		).toBeUndefined();
		expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/workspace.*registry unreadable/s));
	});

	it('explains the refusal of a worker whose source does not accept the kind (for the failure message)', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(
			router.refusesWorkspace(step({ requires: ['sandbox'], workspaceKind: 'in-place' }), poolbox.worker)
		).toBe(true);
		expect(router.refusesWorkspace(step({ requires: ['sandbox'], workspaceKind: 'pool' }), poolbox.worker)).toBe(
			false
		);
		expect(router.refusesWorkspace(step({ workspaceKind: 'in-place' }), poolbox.worker)).toBe(false);
	});
});
