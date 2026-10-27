import { cacheFilePath, writeCache } from '@wadeck-app/shared-updater';
import type { StepDistributionProvider, StepPlacement, WorkerAcceptanceProvider } from 'extension-points';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { DefaultStepDistribution, DefaultWorkerAcceptance, type RoutingCandidate, StepRouter } from './StepRouter.js';
import type { RegisteredWorker } from './WorkerRegistry.js';

/** The router only ever uses the socket as an identity, never calls it. */
function candidate(workerId: string, overrides: Partial<RegisteredWorker> = {}): RoutingCandidate {
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

describe('DefaultWorkerAcceptance', () => {
	const acceptance = new DefaultWorkerAcceptance();

	// Labels are greenfield: an exclusive default would leave every fresh worker inert
	// and make the feature look broken (D#22).
	it('accepts an unlabelled worker for an unlabelled step', () => {
		expect(acceptance.accepts({ step: step(), worker: candidate('w1').worker })).toBe(true);
	});

	it('accepts a worker carrying labels the step never asked for', () => {
		const worker = candidate('w1', { labels: ['gpu'] }).worker;
		expect(acceptance.accepts({ step: step(), worker })).toBe(true);
	});

	it('refuses a worker missing a label the step demands', () => {
		const worker = candidate('w1', { labels: ['linux'] }).worker;
		expect(acceptance.accepts({ step: step({ labels: ['gpu'] }), worker })).toBe(false);
	});

	it('requires every demanded label, not just one', () => {
		const worker = candidate('w1', { labels: ['gpu'] }).worker;
		expect(acceptance.accepts({ step: step({ labels: ['gpu', 'linux'] }), worker })).toBe(false);
	});

	// Only a worker with a terminal can prompt a human (D#32).
	it('refuses a headless worker for a step that needs a user interface', () => {
		const worker = candidate('w1', { hasUserInterface: false }).worker;
		expect(acceptance.accepts({ step: step({ requiresUserInterface: true }), worker })).toBe(false);
	});

	it('accepts an interactive worker for a step that needs one', () => {
		const worker = candidate('w1', { hasUserInterface: true }).worker;
		expect(acceptance.accepts({ step: step({ requiresUserInterface: true }), worker })).toBe(true);
	});

	// A daemon-created worker exists to serve this daemon's queue, so it has no declared
	// project set to check against.
	it('accepts a daemon-created worker for any project', () => {
		const worker = candidate('w1', { ephemeral: true }).worker;
		expect(acceptance.accepts({ step: step({ projectId: 'proj0001', projectRoot: 'C:/proj' }), worker })).toBe(
			true
		);
	});

	// Serving a project beyond its launch directory is explicit opt-in (D#9).
	it('accepts a registered worker attached to the step project', () => {
		const worker = candidate('w1', { ephemeral: false, attachedProjectIds: ['proj0001', 'other001'] }).worker;
		expect(acceptance.accepts({ step: step({ projectId: 'proj0001', projectRoot: 'C:/proj' }), worker })).toBe(
			true
		);
	});

	it('refuses a registered worker not attached to the step project', () => {
		const worker = candidate('w1', { ephemeral: false, attachedProjectIds: ['other001'] }).worker;
		expect(acceptance.accepts({ step: step({ projectId: 'proj0001', projectRoot: 'C:/proj' }), worker })).toBe(
			false
		);
	});

	// Routing is by registry id: the same folder under another id (a re-registered project) is another project.
	it('matches the project id, not the folder: a worker attached to the same path but not the id is refused', () => {
		const worker = candidate('w1', {
			ephemeral: false,
			attachedProjects: ['C:/proj'],
			attachedProjectIds: ['other001'],
		}).worker;
		expect(acceptance.accepts({ step: step({ projectId: 'proj0001', projectRoot: 'C:/proj' }), worker })).toBe(
			false
		);
	});

	it('refuses a registered worker for a step that carries only a project root (no id to match)', () => {
		const worker = candidate('w1', { ephemeral: false, attachedProjectIds: ['proj0001'] }).worker;
		expect(acceptance.accepts({ step: step({ projectRoot: 'C:/proj' }), worker })).toBe(false);
	});

	// Nothing to check the attachment against, so the answer is no rather than a guess.
	it('refuses a registered worker when the run belongs to no project', () => {
		const worker = candidate('w1', { ephemeral: false, attachedProjectIds: ['proj0001'] }).worker;
		expect(acceptance.accepts({ step: step(), worker })).toBe(false);
	});

	// A step requiring a shell the worker never declared must not be dispatched, not
	// silently allowed through (no-silent-fallback constraint).
	it('refuses a worker missing the shell a step requires', () => {
		const worker = candidate('w1', { shellCapabilities: ['cmd'] }).worker;
		expect(acceptance.accepts({ step: step({ shellKind: 'bash' }), worker })).toBe(false);
	});

	it('accepts a worker that declared the shell a step requires', () => {
		const worker = candidate('w1', { shellCapabilities: ['bash', 'cmd'] }).worker;
		expect(acceptance.accepts({ step: step({ shellKind: 'bash' }), worker })).toBe(true);
	});

	it('accepts a worker regardless of its shell capabilities when the step requests none', () => {
		const worker = candidate('w1', { shellCapabilities: [] }).worker;
		expect(acceptance.accepts({ step: step(), worker })).toBe(true);
	});
});

describe('DefaultStepDistribution', () => {
	const distribution = new DefaultStepDistribution();

	// A worker someone launched is idle capacity that already exists; forking another one
	// costs a process (D#23).
	it('puts registered workers before daemon-created ones', () => {
		const ordered = distribution.order([
			candidate('forked', { ephemeral: true }).worker,
			candidate('registered', { ephemeral: false }).worker,
		]);

		expect(ordered.map(w => w.workerId)).toEqual(['registered', 'forked']);
	});

	// Priority orders acquisition and never caps it (D#24): every candidate survives.
	it('keeps every candidate', () => {
		const ordered = distribution.order([
			candidate('a', { ephemeral: true }).worker,
			candidate('b', { ephemeral: false }).worker,
			candidate('c', { ephemeral: true }).worker,
		]);

		expect(ordered).toHaveLength(3);
		expect(ordered.map(w => w.workerId).sort()).toEqual(['a', 'b', 'c']);
	});

	it('preserves registration order within the same provenance', () => {
		const ordered = distribution.order([
			candidate('first', { ephemeral: false }).worker,
			candidate('second', { ephemeral: false }).worker,
		]);

		expect(ordered.map(w => w.workerId)).toEqual(['first', 'second']);
	});
});

// Passive preference for an idle worker already running the daemon's latest known
// flow-cli version (D#TBD) -- never a gate, just the lowest-priority tie-break.
describe('DefaultStepDistribution version preference', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'step-router-version-')));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	function seedLatestVersion(version: string): void {
		writeCache(cacheFilePath(tmpDir), { lastCheckedAt: Date.now(), latestVersion: version });
	}

	it('prefers a candidate matching the cached latest version over an otherwise-equal one that does not', () => {
		seedLatestVersion('1.2.0');
		const distribution = new DefaultStepDistribution(tmpDir);

		const ordered = distribution.order([
			candidate('stale', { ephemeral: false, version: '1.1.0' }).worker,
			candidate('current', { ephemeral: false, version: '1.2.0' }).worker,
		]);

		expect(ordered.map(w => w.workerId)).toEqual(['current', 'stale']);
	});

	// Never a gate: every candidate still comes back even when none of them is current.
	it('falls back to the existing order when every idle candidate is stale', () => {
		seedLatestVersion('1.2.0');
		const distribution = new DefaultStepDistribution(tmpDir);

		const ordered = distribution.order([
			candidate('a', { ephemeral: false, version: '1.0.0' }).worker,
			candidate('b', { ephemeral: false, version: '1.1.0' }).worker,
		]);

		expect(ordered.map(w => w.workerId)).toEqual(['a', 'b']);
	});

	it('leaves ordering unchanged when there is no updater cache yet', () => {
		const distribution = new DefaultStepDistribution(tmpDir); // no cache file written

		const ordered = distribution.order([
			candidate('a', { ephemeral: false, version: '1.0.0' }).worker,
			candidate('b', { ephemeral: false, version: '1.2.0' }).worker,
		]);

		expect(ordered.map(w => w.workerId)).toEqual(['a', 'b']);
	});

	// Lowest priority: registered-vs-forked (D#23) still wins even when the forked
	// candidate happens to be current and the registered one stale.
	it('never overrides the registered-before-forked priority already in order()', () => {
		seedLatestVersion('1.2.0');
		const distribution = new DefaultStepDistribution(tmpDir);

		const ordered = distribution.order([
			candidate('forked-current', { ephemeral: true, version: '1.2.0' }).worker,
			candidate('registered-stale', { ephemeral: false, version: '1.0.0' }).worker,
		]);

		expect(ordered.map(w => w.workerId)).toEqual(['registered-stale', 'forked-current']);
	});

	// D#24: preference orders candidates, it never drops one.
	it('keeps every candidate while applying the version preference', () => {
		seedLatestVersion('1.2.0');
		const distribution = new DefaultStepDistribution(tmpDir);

		const ordered = distribution.order([
			candidate('a', { ephemeral: false, version: '1.0.0' }).worker,
			candidate('b', { ephemeral: false, version: '1.2.0' }).worker,
			candidate('c', { ephemeral: false }).worker, // never reported a version
		]);

		expect(ordered).toHaveLength(3);
		expect(ordered.map(w => w.workerId).sort()).toEqual(['a', 'b', 'c']);
	});
});

describe('StepRouter', () => {
	it('returns nothing when there is no candidate at all', () => {
		expect(new StepRouter().select(step(), [])).toBeUndefined();
	});

	it('returns nothing when no candidate accepts the step', () => {
		const router = new StepRouter();
		const candidates = [candidate('w1', { ephemeral: false, attachedProjectIds: ['other001'] })];

		expect(router.select(step({ projectId: 'proj0001', projectRoot: 'C:/proj' }), candidates)).toBeUndefined();
	});

	it('returns the socket of the first eligible worker in distribution order', () => {
		const router = new StepRouter();
		const forked = candidate('forked', { ephemeral: true });
		const registered = candidate('registered', { ephemeral: false, attachedProjectIds: ['proj0001'] });

		const chosen = router.select(step({ projectId: 'proj0001', projectRoot: 'C:/proj' }), [forked, registered]);

		expect(chosen).toBe(registered.ws);
	});

	it('skips a worker the acceptance provider refuses even if it sorts first', () => {
		const acceptance: WorkerAcceptanceProvider = {
			accepts: ({ worker }) => worker.workerId !== 'registered',
		};
		const router = new StepRouter(acceptance);
		const forked = candidate('forked', { ephemeral: true });
		const registered = candidate('registered', { ephemeral: false, attachedProjectIds: ['proj0001'] });

		expect(router.select(step({ projectId: 'proj0001', projectRoot: 'C:/proj' }), [forked, registered])).toBe(
			forked.ws
		);
	});

	// A distribution plugin that drops candidates caps parallelism, which is invisible in
	// the result -- the flow just runs slower. So it is reported and not honoured (D#24).
	it('reports a distribution provider that drops a candidate and ignores its order', () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const distribution: StepDistributionProvider = { order: candidates => candidates.slice(0, 1) };
		const router = new StepRouter(undefined, distribution);
		const first = candidate('a');
		const second = candidate('b');

		const chosen = router.select(step(), [first, second]);

		expect(chosen).toBe(first.ws);
		expect(write.mock.calls.map(call => String(call[0])).join(' ')).toMatch(/candidate/i);
		write.mockRestore();
	});

	it('reports a distribution provider that invents a candidate', () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const distribution: StepDistributionProvider = {
			order: candidates => [...candidates, candidate('ghost').worker],
		};
		const router = new StepRouter(undefined, distribution);
		const only = candidate('a');

		expect(router.select(step(), [only])).toBe(only.ws);
		expect(write).toHaveBeenCalled();
		write.mockRestore();
	});

	// An acceptance provider is author-written and in-process; a throw must not take the
	// dispatch loop with it, but it must not silently place the step either.
	it('treats a throwing acceptance provider as a refusal and reports it', () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const acceptance: WorkerAcceptanceProvider = {
			accepts: () => {
				throw new Error('plugin blew up');
			},
		};

		expect(new StepRouter(acceptance).select(step(), [candidate('w1')])).toBeUndefined();
		expect(write.mock.calls.map(call => String(call[0])).join(' ')).toContain('plugin blew up');
		write.mockRestore();
	});
});

describe('StepRouter - run bound to a worker type', () => {
	const typed = (workerId: string, sourceId: string, overrides: Partial<RegisteredWorker> = {}) =>
		candidate(workerId, { sourceId, ...overrides });
	const types: Record<string, string> = { 'sbx-1': 'sandbox', 'sbx-2': 'sandbox', 'gpu-1': 'gpu' };
	const workerTypes = {
		typeLookup: () => (sourceId: string | undefined) => (sourceId === undefined ? undefined : types[sourceId]),
	};

	it('places a bound step on the worker of that type even when a host worker is listed first', () => {
		const router = new StepRouter(undefined, undefined, workerTypes);
		const host = candidate('host');
		const sandbox = typed('sandbox', 'sbx-1');

		expect(router.select(step({ boundWorkerType: 'sandbox' }), [host, sandbox])).toBe(sandbox.ws);
	});

	it('places nothing when only host workers and workers of another type are idle', () => {
		const router = new StepRouter(undefined, undefined, workerTypes);
		const candidates = [candidate('host'), typed('gpu', 'gpu-1'), typed('unknown-source', 'ghost')];

		expect(router.select(step({ boundWorkerType: 'sandbox' }), candidates)).toBeUndefined();
	});

	it('places a step that is not bound on any worker, typed or not, as before', () => {
		const router = new StepRouter(undefined, undefined, workerTypes);
		const host = candidate('host');

		expect(router.select(step(), [host, typed('sandbox', 'sbx-1')])).toBe(host.ws);
	});

	// S4 is documented as not a security boundary: it must not be able to bring a refused worker back.
	it('does not let a permissive acceptance plugin or a distribution plugin bring a worker of another type back', () => {
		const acceptance: WorkerAcceptanceProvider = { accepts: () => true };
		const distribution: StepDistributionProvider = { order: candidates => [...candidates].reverse() };
		const router = new StepRouter(acceptance, distribution, workerTypes);

		expect(router.select(step({ boundWorkerType: 'sandbox' }), [candidate('host')])).toBeUndefined();
	});

	it('asks the acceptance plugin only about workers of the bound type', () => {
		const asked: string[] = [];
		const acceptance: WorkerAcceptanceProvider = {
			accepts: ({ worker }) => {
				asked.push(worker.workerId);
				return true;
			},
		};
		const router = new StepRouter(acceptance, undefined, workerTypes);

		router.select(step({ boundWorkerType: 'sandbox' }), [candidate('host'), typed('sandbox', 'sbx-1')]);

		expect(asked).toEqual(['sandbox']);
	});

	it('still applies the ordinary rules among workers of the bound type', () => {
		const router = new StepRouter(undefined, undefined, workerTypes);
		const noLabel = typed('one', 'sbx-1');
		const labelled = typed('two', 'sbx-2', { labels: ['big'] });

		expect(router.select(step({ boundWorkerType: 'sandbox', labels: ['big'] }), [noLabel, labelled])).toBe(
			labelled.ws
		);
	});

	// No lookup wired is a wiring gap: the safe answer is that nobody has a type, never that anybody does.
	it('places a bound step nowhere when no type lookup was given', () => {
		const router = new StepRouter();

		expect(router.select(step({ boundWorkerType: 'sandbox' }), [typed('sandbox', 'sbx-1')])).toBeUndefined();
	});

	it('places nothing, and says why on stderr, when the source registry cannot be read', () => {
		const written: string[] = [];
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
			written.push(String(chunk));
			return true;
		});
		const router = new StepRouter(undefined, undefined, {
			typeLookup: () => {
				throw new Error('registry file is corrupt');
			},
		});

		const chosen = router.select(step({ boundWorkerType: 'sandbox' }), [typed('sandbox', 'sbx-1')]);
		stderr.mockRestore();

		expect(chosen).toBeUndefined();
		expect(written.join('')).toContain('registry file is corrupt');
	});
});
