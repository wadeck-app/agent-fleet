import type { WebSocket } from 'ws';

/** What the tracker needs to know about a worker message; the full protocol type is not required. */
export interface TrackedMessage {
	type: string;
	executionId?: string;
	stepId?: string;
}

export interface CloseDetails {
	code: number;
	reason: string;
	/** Registry id of the worker, when it had registered. */
	workerId?: string;
	pid?: number;
}

export interface DisconnectReport {
	/** One line for the daemon log. */
	logLine: string;
	/** True when a step that had started executing was on the connection. */
	lostStartedStep: boolean;
	/** Text to append to the failure of a step lost with this connection, or undefined when it was not one. */
	noteForStep(executionId: string, stepId: string): string | undefined;
}

interface ConnectionState {
	lastType: string | undefined;
	lastAt: number;
	startedSteps: Map<string, number>;
}

function formatSeconds(ms: number): string {
	return `${(ms / 1000).toFixed(1)} s`;
}

function describeCode(code: number): string {
	if (code === 1006) {
		return '1006 (no close frame: the worker process or the connection died abruptly)';
	}
	if (code === 1009) {
		return '1009 (a frame was over the size limit)';
	}
	return String(code);
}

/**
 * Remembers, per worker connection, what the worker last said and which steps it began, so a
 * disconnect can be explained after the fact: the socket itself keeps none of this.
 */
export class WorkerConnectionTracker {
	private readonly connections = new WeakMap<WebSocket, ConnectionState>();

	constructor(private readonly now: () => number = Date.now) {}

	noteMessage(ws: WebSocket, message: TrackedMessage): void {
		let state = this.connections.get(ws);
		if (state === undefined) {
			state = { lastType: undefined, lastAt: 0, startedSteps: new Map() };
			this.connections.set(ws, state);
		}
		state.lastType = message.type;
		state.lastAt = this.now();
		if (message.executionId === undefined || message.stepId === undefined) {
			return;
		}
		const key = `${message.executionId}/${message.stepId}`;
		if (message.type === 'step_started') {
			state.startedSteps.set(key, this.now());
		} else if (message.type === 'step_completed' || message.type === 'step_failed') {
			state.startedSteps.delete(key);
		}
	}

	describeClose(ws: WebSocket, details: CloseDetails): DisconnectReport {
		const state = this.connections.get(ws);
		const at = this.now();
		const who = `worker ${details.workerId ?? 'unregistered'}${details.pid !== undefined ? ` (pid ${String(details.pid)})` : ''}`;
		const last =
			state?.lastType === undefined
				? 'no message received from it'
				: `last message received: ${state.lastType}, ${String(at - state.lastAt)} ms ago`;
		const started = [...(state?.startedSteps ?? [])];
		const running =
			started.length === 0
				? 'no started step'
				: `started steps: ${started.map(([key, startedAt]) => `${key} running for ${formatSeconds(at - startedAt)}`).join(', ')}`;
		const reason = details.reason === '' ? '' : `, reason "${details.reason}"`;
		const logLine = `${who} disconnected (close code ${describeCode(details.code)}${reason}); ${last}; ${running}`;

		return {
			logLine,
			lostStartedStep: started.length > 0,
			noteForStep: (executionId, stepId) => {
				const startedAt = state?.startedSteps.get(`${executionId}/${stepId}`);
				if (startedAt === undefined) {
					return undefined;
				}
				return (
					`Disconnect details: ${who} closed with code ${describeCode(details.code)}${reason} after running this step for ${formatSeconds(at - startedAt)}; ${last}. ` +
					`The daemon log has the worker's exit code or signal and the last lines of its stderr: look for this worker's pid and close code there.`
				);
			},
		};
	}
}
