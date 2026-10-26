import type { StepMeta } from 'flow-engine/types';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import type {
	AssignmentScopedMessage,
	DaemonToWorker,
	StepIoCapture,
	WorkerReady,
	WorkerToDaemon,
} from '../../ipc/Protocol';
import type { WorkerAdapter } from '../../worker/WorkerAdapter';
import type { WorkerDisplay } from '../../worker/WorkerDisplay';
// violations-suppress-end: ts/no-deep-relative
import type { BusyTracker } from './WorkerSelfUpdate';

export async function handleWorkerMessage(
	message: DaemonToWorker,
	adapter: WorkerAdapter,
	send: (message: WorkerToDaemon) => void,
	registration: Omit<WorkerReady, 'type'>,
	display: WorkerDisplay,
	busyTracker: BusyTracker
): Promise<void> {
	switch (message.type) {
		case 'assign': {
			const { assignmentId, stepId, stepConfig, executionContext } = message;
			// Bound to this assignment so step execution cannot report against another.
			// Also where this terminal sees the step's own output: the worker produces those
			// lines, so showing them here costs nothing (D#31).
			const sendForAssignment = (scoped: AssignmentScopedMessage): void => {
				if (scoped.type === 'log') {
					display.stepLog(stepId, scoped.entry);
				}
				send({ ...scoped, assignmentId } as WorkerToDaemon);
			};
			display.stepStarted(stepId, {
				executionId: executionContext.executionId,
				stepName: (stepConfig as unknown as { name?: string }).name,
				flowId: executionContext.flowId,
				flowVersion: executionContext.flowVersion,
			});
			const startedAt = Date.now();
			// Announced before the first side effect: after this the daemon treats a
			// disconnect as a failure rather than replaying the step (D#65). Closing this
			// terminal before a step starts therefore costs the flow nothing.
			sendForAssignment({ type: 'step_started', executionId: executionContext.executionId, stepId });
			// This is the only place busy state changes (see runWorker's self-update timer):
			// true for the whole execute() call, false again no matter how it ends.
			busyTracker.busy = true;
			try {
				const { output, meta, io } = await adapter.execute(stepConfig, executionContext, sendForAssignment);
				sendForAssignment({
					type: 'step_completed',
					executionId: executionContext.executionId,
					stepId,
					output,
					meta,
					io,
				});
				display.stepCompleted(stepId, Date.now() - startedAt);
			} catch (err) {
				const error = normalizeError(err).message;
				const output = (err as { stepOutputs?: Record<string, unknown> }).stepOutputs;
				const stdout = (err as { stdout?: string }).stdout;
				const stderr = (err as { stderr?: string }).stderr;
				const io = (err as { io?: StepIoCapture }).io;
				const meta = (err as { meta?: StepMeta }).meta;
				sendForAssignment({
					type: 'step_failed',
					executionId: executionContext.executionId,
					stepId,
					error,
					output,
					stdout,
					stderr,
					io,
					meta,
				});
				display.stepFailed(stepId, error, Date.now() - startedAt);
			} finally {
				busyTracker.busy = false;
			}
			// A version bump detected mid-step is only acted on now, right as the worker goes
			// idle again -- not on the next periodic tick, which could be minutes away.
			busyTracker.onIdle();
			// No credential refresh here: this socket is already authenticated, and re-reading a
			// token mid-connection would only matter if the daemon re-checked it, which it does not.
			send({ type: 'ready', ...registration });
			break;
		}
		case 'idle':
			break;
		case 'done':
			// Only sent to workers the daemon created. Reaching here would mean the daemon
			// treated this worker as disposable, so say so rather than quietly exiting.
			console.error(
				'[warn] received the shutdown notice meant for daemon-created workers; staying alive. Please report this.'
			);
			break;
		default: {
			const exhaustive: never = message;
			console.error(`[warn] unknown daemon message: ${JSON.stringify(exhaustive)}`);
		}
	}
}
