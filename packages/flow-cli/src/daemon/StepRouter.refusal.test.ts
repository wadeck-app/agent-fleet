import type { StepPlacement, WorkerAcceptanceProvider, WorkerCandidate } from 'extension-points';
import { describe, expect, it, vi } from 'vitest';

import { DefaultStepDistribution, DefaultWorkerAcceptance, StepRouter } from './StepRouter.js';
import { explainDefaultRefusal } from './WorkerRefusal.js';

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
const worker = (overrides: Partial<WorkerCandidate> = {}): WorkerCandidate => ({
	workerId: 'w-1',
	labels: [],
	attachedProjectIds: [],
	attachedProjects: [],
	hasUserInterface: false,
	ephemeral: true,
	shellCapabilities: [],
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
