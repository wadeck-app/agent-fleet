#!/usr/bin/env node
import { StepRunner } from 'flow-engine';
import type { StepRunnerConfig } from 'flow-engine';
import type { StepMeta } from 'flow-engine/types';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import { WebSocket } from 'ws';

import type { AssignmentScopedMessage, DaemonToWorker, StepIoCapture, WorkerToDaemon } from '../ipc/Protocol';
import type { McpServerConfig } from './McpServer';
import { WorkerAdapter } from './WorkerAdapter';
import { installWorkerCrashHandlers } from './WorkerCrashHandlers';
import { serializeWorkerFrame } from './WorkerFrame';
import { buildForkedWorkerReady } from './WorkerLaunch';

// Before anything can throw: the daemon only learns why a worker died from the last lines of its stderr.
installWorkerCrashHandlers(
	process,
	text => process.stderr.write(text),
	code => process.exit(code)
);

const wsPort = process.env['FLOW_WS_PORT'];
if (!wsPort) {
	process.stderr.write('FLOW_WS_PORT not set\n');
	process.exit(1);
}

const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);

function send(message: WorkerToDaemon): void {
	if (ws.readyState === ws.OPEN) {
		// Throws on a frame the daemon would answer by closing the socket (see WorkerFrame). A too-large
		// step_completed is thrown inside the assign handler's try, so it is reported as a step_failed.
		ws.send(serializeWorkerFrame(message));
	}
}

// Probed once at launch, then repeated verbatim in every `ready` (connect and after each step).
const READY = buildForkedWorkerReady(process.env, process.pid);

const baseConfig: StepRunnerConfig = { interactive: false };

const adapter = new WorkerAdapter((mcpServers: McpServerConfig[]) => {
	// Pass mcpServers -- StepRunner injects them into the model provider on each step
	// McpServerConfig is structurally identical to flow-engine's McpServer -- cast is safe.
	const config = (mcpServers.length > 0 ? { ...baseConfig, mcpServers } : baseConfig) as StepRunnerConfig;
	return new StepRunner(config);
});

ws.on('open', () => {
	send({ type: 'ready', ...READY });
});

ws.on('message', (data: Buffer) => {
	let message: DaemonToWorker;
	try {
		message = JSON.parse(data.toString()) as DaemonToWorker;
	} catch (err) {
		process.stderr.write(`[worker] failed to parse daemon message: ${String(err)}\n`);
		return;
	}
	void handleMessage(message);
});

ws.on('error', (err: Error) => {
	process.stderr.write(`WebSocket error: ${String(err)}\n`);
	process.exit(1);
});
ws.on('close', (code: number, reason: Buffer) => {
	process.stderr.write(
		`[worker] daemon connection closed (code ${String(code)}, reason "${reason.toString()}"), exiting\n`
	);
	process.exit(0);
});

async function handleMessage(message: DaemonToWorker): Promise<void> {
	switch (message.type) {
		case 'assign': {
			const { assignmentId, stepId, stepConfig, executionContext } = message;
			// Bound to this assignment, so step execution cannot report against another.
			const sendForAssignment = (scoped: AssignmentScopedMessage): void => {
				send({ ...scoped, assignmentId } as WorkerToDaemon);
			};
			// Announced before the first side effect: after this the daemon treats a
			// disconnect as a failure rather than replaying the step (D#65).
			sendForAssignment({ type: 'step_started', executionId: executionContext.executionId, stepId });
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
			}
			send({ type: 'ready', ...READY });
			break;
		}
		case 'idle':
			break;
		case 'run_end':
			// Only sent to workers declaring `run-events`, which this worker never does: reaching it is a daemon bug, and
			// not acknowledging is right -- it did not claim to.
			process.stderr
				.write(`[worker] ignoring run_end for ${message.executionId}: this worker does not declare run-events
`);
			break;
		case 'done':
			ws.close();
			break;
		default: {
			const _exhaustive: never = message;
			process.stderr.write(`Unknown daemon message: ${JSON.stringify(_exhaustive)}\n`);
		}
	}
}
