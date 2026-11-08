import type { StepPlacement, WorkerAcceptanceProvider } from 'extension-points';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { type RoutingCandidate, StepRouter } from './StepRouter.js';
import type { RegisteredWorker } from './WorkerRegistry.js';

function candidate(
	workerId: string,
	sourceId: string | undefined,
	overrides: Partial<RegisteredWorker> = {}
): RoutingCandidate {
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
			...overrides,
		},
	};
}

const step = (overrides: Partial<StepPlacement> = {}): StepPlacement => ({
	stepId: 's1',
	labels: [],
	requiresUserInterface: false,
	...overrides,
});

const GUARANTEES: Record<string, string[]> = { sbx: ['fs=confined', 'env=clean'], plain: [] };
const catalog = {
	typeLookup: () => (sourceId: string | undefined) => (sourceId === 'sbx' ? 'sandbox' : undefined),
	exclusiveLookup: () => () => false,
	guaranteeLookup: () => (sourceId: string | undefined) =>
		sourceId === undefined ? [] : (GUARANTEES[sourceId] ?? []),
};

let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
	stderr.mockRestore();
});

describe('StepRouter - requirements (hard filter on the guarantees of the source)', () => {
	const sandboxed = candidate('w-sbx', 'sbx');
	const plain = candidate('w-plain', 'plain');
	const host = candidate('w-host', undefined);

	it('sends a step that requires something only to workers whose source guarantees all of it', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(router.select(step({ requires: ['fs=confined', 'env=clean'] }), [host, plain, sandboxed])).toBe(
			sandboxed.ws
		);
	});

	it('leaves a step that requires nothing to every worker, as before', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(router.select(step(), [host, sandboxed])).toBe(host.ws);
		expect(router.select(step({ requires: [] }), [host, sandboxed])).toBe(host.ws);
	});

	it('places the step nowhere when no worker meets all of it', () => {
		const router = new StepRouter(undefined, undefined, catalog);

		expect(router.select(step({ requires: ['fs=confined', 'net=filtered'] }), [host, sandboxed])).toBeUndefined();
	});

	// B1: a worker declares its labels itself, so they can never stand for a guarantee.
	it('does not count what the worker declared itself in its labels', () => {
		const router = new StepRouter(undefined, undefined, catalog);
		const liar = candidate('w-liar', 'plain', { labels: ['fs=confined'] });

		expect(router.select(step({ requires: ['fs=confined'] }), [liar])).toBeUndefined();
	});

	// B2: S4 is replaceable; the requirement must hold whatever it answers.
	it('is not bypassed by an acceptance plugin that accepts everything', () => {
		const acceptEverything: WorkerAcceptanceProvider = { accepts: () => true };
		const router = new StepRouter(acceptEverything, undefined, catalog);

		expect(router.select(step({ requires: ['fs=confined'] }), [host, plain])).toBeUndefined();
		expect(router.select(step({ requires: ['fs=confined'] }), [host, plain, sandboxed])).toBe(sandboxed.ws);
	});

	it('does not ask the acceptance plugin about a worker that does not meet the requirement', () => {
		const accepts = vi.fn(() => true);
		const router = new StepRouter({ accepts }, undefined, catalog);

		router.select(step({ requires: ['fs=confined'] }), [host, plain, sandboxed]);

		expect(accepts).toHaveBeenCalledTimes(1);
	});

	it('requires the worker type too when the run is bound (both must hold)', () => {
		const router = new StepRouter(undefined, undefined, catalog);
		const bound = step({ boundWorkerType: 'sandbox', requires: ['net=filtered'] });

		expect(router.select(bound, [sandboxed])).toBeUndefined();
		expect(router.select(step({ boundWorkerType: 'sandbox', requires: ['fs=confined'] }), [host, sandboxed])).toBe(
			sandboxed.ws
		);
		expect(
			router.select(step({ boundWorkerType: 'other', requires: ['fs=confined'] }), [sandboxed])
		).toBeUndefined();
	});

	it('fails closed, and says so on stderr, when the guarantees cannot be read', () => {
		const broken = {
			...catalog,
			guaranteeLookup: () => {
				throw new Error('registry unreadable');
			},
		};
		const router = new StepRouter(undefined, undefined, broken);

		expect(router.select(step({ requires: ['fs=confined'] }), [sandboxed])).toBeUndefined();
		expect(String(stderr.mock.calls.flat().join(''))).toMatch(/cannot tell.*guarantee.*s1.*registry unreadable/s);
	});

	it('fails closed, and says so on stderr, when the router was built without a guarantee source', () => {
		const router = new StepRouter(undefined, undefined, {
			typeLookup: catalog.typeLookup,
			exclusiveLookup: catalog.exclusiveLookup,
		});

		expect(router.select(step({ requires: ['fs=confined'] }), [host, sandboxed])).toBeUndefined();
		expect(String(stderr.mock.calls.flat().join(''))).toMatch(/no guarantee source/);
		expect(router.select(step(), [host])).toBe(host.ws);
	});

	it('uses the lookup the caller already has, like the type and the exclusivity', () => {
		const router = new StepRouter(undefined, undefined, catalog);
		const given = () => ['fs=confined'];

		expect(router.select(step({ requires: ['fs=confined'] }), [plain], undefined, undefined, given)).toBe(plain.ws);
	});

	it('names what a worker lacks, for a failure message, without consulting any plugin', () => {
		const router = new StepRouter({ accepts: () => true }, undefined, catalog);

		expect(
			router.missingRequirementsOf(step({ requires: ['fs=confined', 'net=filtered'] }), sandboxed.worker)
		).toEqual(['net=filtered']);
		expect(router.missingRequirementsOf(step(), plain.worker)).toEqual([]);
	});
});

// Asking for a guarantee is an explicit opt-in, like binding by workerType: an exclusive source may serve a step whose
// requirements it fully guarantees, and still never a step that asks for nothing.
describe('StepRouter - requirements and exclusive sources', () => {
	const exclusiveCatalog = {
		typeLookup: () => (sourceId: string | undefined) => (sourceId === 'xsbx' ? 'sandbox' : undefined),
		exclusiveLookup: () => (sourceId: string | undefined) => sourceId === 'xsbx',
		guaranteeLookup: () => (sourceId: string | undefined) => (sourceId === 'xsbx' ? ['sandbox'] : []),
	};
	const exclusiveWorker = candidate('w-x', 'xsbx');
	const host = candidate('w-host', undefined);
	let silence: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		silence = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});
	afterEach(() => {
		silence.mockRestore();
	});

	it('serves a step whose requirements it fully guarantees', () => {
		const router = new StepRouter(undefined, undefined, exclusiveCatalog);

		expect(router.select(step({ requires: ['sandbox'] }), [host, exclusiveWorker])).toBe(exclusiveWorker.ws);
	});

	it('still does not serve a step without requirements', () => {
		const router = new StepRouter(undefined, undefined, exclusiveCatalog);

		expect(router.select(step(), [exclusiveWorker])).toBeUndefined();
		expect(router.select(step({ requires: [] }), [exclusiveWorker])).toBeUndefined();
	});

	it('does not serve a step requiring something it does not guarantee', () => {
		const router = new StepRouter(undefined, undefined, exclusiveCatalog);

		expect(router.select(step({ requires: ['sandbox', 'other'] }), [exclusiveWorker])).toBeUndefined();
	});

	it('does not bring an exclusive worker to a run bound to another type', () => {
		const router = new StepRouter(undefined, undefined, exclusiveCatalog);

		expect(
			router.select(step({ boundWorkerType: 'gpu', requires: ['sandbox'] }), [exclusiveWorker])
		).toBeUndefined();
	});
});
