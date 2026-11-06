import type { StepPlacement, WorkerAcceptanceProvider, WorkerCandidate } from 'extension-points';
import { describe, expect, it, vi } from 'vitest';

import { DefaultStepDistribution, DefaultWorkerAcceptance, StepRouter } from './StepRouter.js';
import { explainDefaultRefusal, tallyAcceptance } from './WorkerRefusal.js';
import type { RegisteredWorker } from './WorkerRegistry.js';

/**
 * Why a connected worker does not take a step, as metadata (ids and the names the flow declared) and never as text a
 * plugin wrote. Asking is read-only: it changes who may receive a step in no way.
 */

const step = (overrides: Partial<StepPlacement> = {}): StepPlacement => ({
	stepId: 's1',
	labels: [],
	requiresUserInterface: false,
	projectId: 'p1',
	...overrides,
});
const worker = (overrides: Partial<RegisteredWorker> = {}): RegisteredWorker => ({
	state: 'idle',
	pid: 1,
	features: [],
	workerId: 'w-1',
	labels: [],
	attachedProjectIds: [],
	attachedProjects: [],
	hasUserInterface: false,
	ephemeral: true,
	shellCapabilities: [],
	...overrides,
});

/** A full registry entry: the fields an acceptance plugin may read beyond the candidate's. */
const registered = (overrides: Partial<RegisteredWorker> = {}): RegisteredWorker => ({
	...worker(),
	state: 'busy',
	pid: 4242,
	version: '9.9.9',
	features: ['secrets'],
	...overrides,
});

const router = (acceptance?: WorkerAcceptanceProvider) =>
	new StepRouter(acceptance, new DefaultStepDistribution('C:/no-such-config-dir'));

describe('StepRouter.refusalOf', () => {
	it('is undefined for a worker that accepts the step', () => {
		expect(router().refusalOf(step(), worker())).toBeUndefined();
	});

	it.each([
		[step({ requiresUserInterface: true }), worker(), 'the step needs a terminal and this worker has none'],
		[step({ labels: ['gpu'] }), worker(), 'it lacks the label "gpu"'],
		[step({ labels: ['gpu', 'linux'] }), worker({ labels: ['linux'] }), 'it lacks the label "gpu"'],
		[step({ labels: ['gpu', 'arm'] }), worker(), 'it lacks the labels "gpu", "arm"'],
		[step({ shellKind: 'bash' }), worker({ shellCapabilities: ['cmd'] }), 'it cannot run the shell "bash"'],
		[step(), worker({ ephemeral: false }), "it does not serve this step's project"],
		[
			step({ projectId: 'p1' }),
			worker({ ephemeral: false, attachedProjectIds: ['p2'] }),
			"it does not serve this step's project",
		],
	])('says why the default rule refuses (%#)', (placement, candidate, reason) => {
		expect(router().refusalOf(placement, candidate)).toBe(reason);
	});

	it('names nothing a plugin wrote when a plugin refuses: one fixed sentence', () => {
		const plugin: WorkerAcceptanceProvider = {
			accepts: () => false,
		};

		expect(router(plugin).refusalOf(step(), worker())).toBe('the worker-acceptance plugin refused it');
	});

	it('treats a plugin that throws as a refusal with the same sentence, and never echoes its error', () => {
		vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const plugin: WorkerAcceptanceProvider = {
			accepts: () => {
				throw new Error('token=abc123 leaked by a plugin');
			},
		};

		const reason = router(plugin).refusalOf(step(), worker());

		expect(reason).toBe('the worker-acceptance plugin refused it');
		vi.restoreAllMocks();
	});

	it('does not change who accepts: a plugin that accepts is still accepted', () => {
		expect(router({ accepts: () => true }).refusalOf(step({ labels: ['gpu'] }), worker())).toBeUndefined();
	});
});

describe('explainDefaultRefusal agrees with the default acceptance rule', () => {
	it('explains a refusal exactly when DefaultWorkerAcceptance refuses, over a grid of steps and workers', () => {
		const acceptance = new DefaultWorkerAcceptance();
		const steps = [
			step(),
			step({ requiresUserInterface: true }),
			step({ labels: ['gpu'] }),
			step({ labels: ['gpu', 'arm'] }),
			step({ shellKind: 'bash' }),
			step({ shellKind: 'pwsh', labels: ['gpu'] }),
			step({ projectId: undefined }),
			step({ projectId: 'p2' }),
		];
		const workers = [
			worker(),
			worker({ ephemeral: false }),
			worker({ ephemeral: false, attachedProjectIds: ['p1'] }),
			worker({ hasUserInterface: true, labels: ['gpu', 'arm'], shellCapabilities: ['bash', 'pwsh'] }),
			worker({
				labels: ['gpu'],
				shellCapabilities: ['pwsh'],
				ephemeral: false,
				attachedProjectIds: ['p1', 'p2'],
			}),
		];

		for (const placement of steps) {
			for (const candidate of workers) {
				expect(explainDefaultRefusal(placement, candidate) === undefined).toBe(
					acceptance.accepts({ step: placement, worker: candidate })
				);
			}
		}
	});
});

describe('refusalOf and select ask the plugin about the SAME worker', () => {
	it('hands the acceptance plugin the full registered worker (version, pid, features), as select() does', () => {
		const seen: Record<string, unknown>[] = [];
		const plugin: WorkerAcceptanceProvider = {
			accepts: ({ worker: candidate }) => {
				seen.push({ ...candidate });
				return true;
			},
		};
		const full = registered();

		router(plugin).refusalOf(step(), full);
		router(plugin).select(step(), [{ ws: {} as never, worker: full }]);

		expect(seen).toHaveLength(2);
		expect(seen[0]).toEqual(seen[1]);
		expect(seen[0]).toMatchObject({ version: '9.9.9', pid: 4242, features: ['secrets'] });
	});
});

describe('tallyAcceptance', () => {
	const bound = step({ boundWorkerType: 'sandbox' });
	const ofType = (id: string, labels: string[] = []) => registered({ workerId: id, labels, sourceId: 'sbx-1' });
	const typeOf = (sourceId: string | undefined) => (sourceId === 'sbx-1' ? 'sandbox' : undefined);

	it('stops at the first worker that accepts: nothing more is asked', () => {
		const calls: string[] = [];
		const spy = {
			refusalOf: (_step: StepPlacement, candidate: WorkerCandidate) => {
				calls.push(candidate.workerId);
				return undefined;
			},
		};

		const tally = tallyAcceptance(spy, bound, [ofType('w-1'), ofType('w-2'), ofType('w-3')], typeOf);

		expect(tally.anyAccepts).toBe(true);
		expect(calls).toEqual(['w-1']);
	});

	it('builds the refusal list only when asked for it, and only from workers of the type', () => {
		const calls: string[] = [];
		const spy = {
			refusalOf: (_step: StepPlacement, candidate: WorkerCandidate) => {
				calls.push(candidate.workerId);
				return 'it lacks the label "gpu"';
			},
		};
		const other = registered({ workerId: 'host-1' });

		const tally = tallyAcceptance(spy, bound, [ofType('w-1'), other], typeOf);
		expect(tally.anyAccepts).toBe(false);
		const callsDuringTally = calls.length;

		expect(tally.refusals()).toEqual(['w-1 (it lacks the label "gpu")']);
		expect(callsDuringTally).toBe(1);
	});
});

describe('the reason text', () => {
	it('quotes and caps a label and a shell the flow declared, and counts the labels beyond five', () => {
		const long = 'x'.repeat(200);
		const reason = explainDefaultRefusal(
			step({ labels: ['a"b\nc', long, 'l3', 'l4', 'l5', 'l6', 'l7'] }),
			worker()
		);

		expect(reason).toBe(`it lacks the labels "a\\"b\\nc", "${'x'.repeat(79)}…", "l3", "l4", "l5" and 2 more`);
		expect(reason).not.toContain('\n');
	});

	it('quotes and caps the shell', () => {
		const reason = explainDefaultRefusal(step({ shellKind: ('bash"' + 'y'.repeat(200)) as never }), worker());

		expect(reason).toBe(`it cannot run the shell "bash\\"${'y'.repeat(74)}…"`);
	});

	it('is what refusalOf says for a default refusal, for every refused pair of the grid (never the plugin sentence)', () => {
		const acceptance = new DefaultWorkerAcceptance();
		const steps = [
			step({ requiresUserInterface: true }),
			step({ labels: ['gpu'] }),
			step({ shellKind: 'bash' }),
			step({ projectId: 'p2' }),
		];
		const workers = [
			worker(),
			worker({ ephemeral: false }),
			worker({ labels: ['gpu'], shellCapabilities: ['pwsh'] }),
		];
		let refused = 0;

		for (const placement of steps) {
			for (const candidate of workers) {
				if (acceptance.accepts({ step: placement, worker: candidate })) continue;
				refused++;
				const reason = router().refusalOf(placement, registered(candidate));
				expect(reason).toBe(explainDefaultRefusal(placement, candidate));
				expect(reason).not.toBe('the worker-acceptance plugin refused it');
			}
		}
		expect(refused).toBeGreaterThan(5);
	});
});
