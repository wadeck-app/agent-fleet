import * as crypto from 'node:crypto';
import type * as net from 'node:net';

import type { InjectedStep } from '../ipc/Protocol';

/** Largest accepted line, and therefore the largest amount of unterminated data kept in memory per connection. */
export const MAX_CALLBACK_LINE_BYTES = 2 * 1024 * 1024;

/** A connection that sends nothing for this long is closed. */
export const DEFAULT_CALLBACK_IDLE_TIMEOUT_MS = 30_000;

export interface McpCallbackConnectionConfig {
	/** Secret the peer must present; never logged. */
	token: string;
	executionId: string;
	onInjectSteps: (steps: InjectedStep[]) => Promise<void>;
	idleTimeoutMs: number;
	/** Receives fixed-text diagnostics only: never the token nor any payload content. */
	log: (message: string) => void;
}

/** Constant-time string comparison; a length mismatch is a plain `false`, never a throw. */
function safeEqual(received: string, expected: string): boolean {
	const receivedBytes = Buffer.from(received, 'utf8');
	const expectedBytes = Buffer.from(expected, 'utf8');
	if (receivedBytes.length !== expectedBytes.length) return false;
	return crypto.timingSafeEqual(receivedBytes, expectedBytes);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInjectedStepList(value: unknown): value is InjectedStep[] {
	return Array.isArray(value) && value.every(item => isPlainObject(item) && typeof item['id'] === 'string');
}

/**
 * One TCP connection from the MCP helper (mcp-server.cjs): newline-delimited JSON
 * `{ token, executionId, steps }` lines.
 *
 * Any local process can connect to the loopback port, so every byte is untrusted until the token
 * matches. A protocol violation (malformed JSON, wrong shape, bad token or executionId, oversize
 * line, idle peer) destroys the connection rather than skipping the line: the legitimate helper
 * never sends such input, so tolerating it only helps an attacker probe. Nothing thrown while
 * handling data may escape as an uncaught exception, since the worker exits on one.
 */
export class McpCallbackConnection {
	private buffer = '';
	private closed = false;

	constructor(
		private readonly socket: net.Socket,
		private readonly config: McpCallbackConnectionConfig
	) {
		socket.setTimeout(config.idleTimeoutMs);
		socket.on('timeout', () => this.reject('idle timeout'));
		socket.on('data', chunk => this.handleData(chunk));
		socket.on('error', err => {
			this.config.log(`TCP socket error: ${err.message}`);
		});
		socket.on('close', () => {
			this.closed = true;
		});
	}

	private handleData(chunk: Buffer): void {
		if (this.closed) return;
		try {
			this.buffer += chunk.toString('utf8');
			let newline: number;
			while (!this.closed && (newline = this.buffer.indexOf('\n')) !== -1) {
				const line = this.buffer.slice(0, newline);
				this.buffer = this.buffer.slice(newline + 1);
				if (line.length > MAX_CALLBACK_LINE_BYTES) {
					this.reject('line too long');
					return;
				}
				if (!line.trim()) continue;
				this.handleLine(line);
			}
			if (!this.closed && this.buffer.length > MAX_CALLBACK_LINE_BYTES) {
				this.reject('line too long');
			}
		} catch {
			// Deliberately no error message: it could quote payload content.
			this.reject('internal error while handling data');
		}
	}

	private handleLine(line: string): void {
		let payload: unknown;
		try {
			payload = JSON.parse(line);
		} catch {
			this.reject('invalid JSON');
			return;
		}
		if (
			!isPlainObject(payload) ||
			typeof payload['token'] !== 'string' ||
			typeof payload['executionId'] !== 'string' ||
			!isInjectedStepList(payload['steps'])
		) {
			this.reject('unexpected payload shape');
			return;
		}
		if (!safeEqual(payload['token'], this.config.token)) {
			this.reject('invalid token');
			return;
		}
		if (!safeEqual(payload['executionId'], this.config.executionId)) {
			this.reject('executionId mismatch');
			return;
		}
		const steps = payload['steps'];
		Promise.resolve(this.config.onInjectSteps(steps)).catch(err => {
			this.config.log(`onInjectSteps error: ${String(err)}`);
		});
	}

	private reject(reason: string): void {
		if (this.closed) return;
		this.closed = true;
		this.config.log(`TCP: connection rejected -- ${reason}`);
		this.socket.destroy();
	}
}
