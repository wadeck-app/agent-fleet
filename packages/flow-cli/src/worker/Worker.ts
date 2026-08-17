#!/usr/bin/env node
import { StepRunner } from 'flow-engine';
import type { StepRunnerConfig } from 'flow-engine';
import { WebSocket } from 'ws';

import type { DaemonToWorker, WorkerToDaemon } from '../ipc/Protocol';
import { WorkerAdapter } from './WorkerAdapter';

const wsPort = process.env['FLOW_WS_PORT'];
if (!wsPort) {
	process.stderr.write('FLOW_WS_PORT not set\n');
	process.exit(1);
}

const ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);

function send(message: WorkerToDaemon): void {
	if (ws.readyState === ws.OPEN) {
		ws.send(JSON.stringify(message));
	}
}

const baseConfig: StepRunnerConfig = { interactive: false };

const adapter = new WorkerAdapter((mcpConfigPath: string) => {
	// Pass mcpConfigPath directly — StepRunner passes it as --mcp-config to Claude CLI
	const config: StepRunnerConfig = mcpConfigPath ? { ...baseConfig, mcpConfigPath } : baseConfig;
	return new StepRunner(config);
});

ws.on('open', () => {
	send({ type: 'ready', pid: process.pid });
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
	process.stderr.write(`WebSocket error: ${err.message}\n`);
	process.exit(1);
});
ws.on('close', () => {
	process.exit(0);
});

async function handleMessage(message: DaemonToWorker): Promise<void> {
	switch (message.type) {
		case 'assign': {
			const { stepId, stepConfig, executionContext } = message;
			try {
				const { output, meta } = await adapter.execute(stepConfig, executionContext, send);
				send({ type: 'step_completed', executionId: executionContext.executionId, stepId, output, meta });
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				send({ type: 'step_failed', executionId: executionContext.executionId, stepId, error });
			}
			send({ type: 'ready', pid: process.pid });
			break;
		}
		case 'idle':
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
