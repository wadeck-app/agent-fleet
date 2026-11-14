import { EventEmitter } from 'node:events';
import type * as net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InjectedStep } from '../ipc/Protocol';
import type { HostToolCallReply, HostToolCallRequest } from './HostToolCallTypes';
import { MAX_CALLBACK_LINE_BYTES, McpCallbackConnection } from './McpCallbackConnection';

const INJECT_TOKEN = 'inject-token-CANARY-1111';
const TOOL_TOKEN = 'tool-token-CANARY-2222';
const EXECUTION_ID = 'exec-1';
const IDLE_MS = 30_000;
const GRACE_MS = 5_000;

/** The parts of net.Socket the connection uses, with the timers and the output observable. */
class FakeSocket extends EventEmitter {
	timeouts: number[] = [];
	written: string[] = [];
	destroyed = false;
	ended = false;

	setTimeout(ms: number): this {
		this.timeouts.push(ms);
		return this;
	}
	write(data: string): boolean {
		this.written.push(data);
		return true;
	}
	end(): this {
		this.ended = true;
		return this;
	}
	destroy(): this {
		if (!this.destroyed) {
			this.destroyed = true;
			this.emit('close');
		}
		return this;
	}
	feed(payload: unknown): void {
		this.emit('data', Buffer.from((typeof payload === 'string' ? payload : JSON.stringify(payload)) + '\n'));
	}
	get lastTimeout(): number | undefined {
		return this.timeouts[this.timeouts.length - 1];
	}
	replies(): Array<Record<string, unknown>> {
		return this.written.map(line => JSON.parse(line) as Record<string, unknown>);
	}
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: Error) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const okReply = (text = 'result'): HostToolCallReply => ({ ok: true, text, truncated: false, exitCode: 0 });

const callLine = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
	v: 2,
	kind: 'call_tool',
	token: TOOL_TOKEN,
	executionId: EXECUTION_ID,
	callId: 'call-1',
	toolId: 'show',
	args: { id: 'T1' },
	...overrides,
});

const injectLine = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
	token: INJECT_TOKEN,
	executionId: EXECUTION_ID,
	steps: [{ id: 'a', type: 'script', script: 'echo' }],
	...overrides,
});

describe('McpCallbackConnection protocol v2', () => {
	let socket: FakeSocket;
	let logs: string[];
	let injected: InjectedStep[][];
	let calls: HostToolCallRequest[];
	let pending: Deferred<HostToolCallReply>;
	let revoked: boolean;
	let signals: AbortSignal[];
	let stop: AbortController;

	const open = (withTools = true): McpCallbackConnection =>
		new McpCallbackConnection(socket as unknown as net.Socket, {
			token: INJECT_TOKEN,
			executionId: EXECUTION_ID,
			onInjectSteps: async steps => {
				injected.push(steps);
			},
			idleTimeoutMs: IDLE_MS,
			log: message => logs.push(message),
			isRevoked: () => revoked,
			...(withTools
				? {
						callTool: {
							toolToken: TOOL_TOKEN,
							declared: [
								{ id: 'show', timeoutSeconds: 30, maxOutputBytes: 100 },
								{ id: 'big', timeoutSeconds: 10, maxOutputBytes: 1_048_576 },
							],
							handler: {
								call: (request: HostToolCallRequest, signal: AbortSignal) => {
									calls.push(request);
									signals.push(signal);
									return pending.promise;
								},
							},
							graceMs: GRACE_MS,
						},
					}
				: {}),
			stopSignal: stop.signal,
		});

	beforeEach(() => {
		socket = new FakeSocket();
		logs = [];
		injected = [];
		calls = [];
		pending = deferred<HostToolCallReply>();
		revoked = false;
		signals = [];
		stop = new AbortController();
	});

	afterEach(() => {
		// No token may ever appear in a diagnostic line.
		for (const line of logs) {
			expect(line).not.toContain('CANARY');
		}
	});

	const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

	it('still accepts a v1 inject line without any reply and keeps the idle timer', async () => {
		open();
		socket.feed(injectLine());
		await settle();
		expect(injected).toEqual([[{ id: 'a', type: 'script', script: 'echo' }]]);
		expect(socket.written).toEqual([]);
		expect(socket.destroyed).toBe(false);
		expect(socket.timeouts).toEqual([IDLE_MS]);
	});

	it('answers a declared call on the same socket, then ends it and restores the idle timer', async () => {
		open();
		socket.feed(callLine());
		await settle();
		expect(calls).toEqual([{ executionId: EXECUTION_ID, callId: 'call-1', toolId: 'show', args: { id: 'T1' } }]);
		// Per-call timer: timeoutSeconds + grace, replacing the idle timer.
		expect(socket.lastTimeout).toBe(30_000 + GRACE_MS);
		pending.resolve(okReply('hello'));
		await settle();
		expect(socket.replies()).toEqual([
			{ v: 2, callId: 'call-1', ok: true, text: 'hello', truncated: false, exitCode: 0 },
		]);
		expect(socket.written[0]?.endsWith('\n')).toBe(true);
		expect(socket.ended).toBe(true);
		expect(socket.lastTimeout).toBe(IDLE_MS);
	});

	it('names the allowed ids when the tool is not declared, without calling the handler', async () => {
		open();
		socket.feed(callLine({ toolId: 'rm-everything' }));
		await settle();
		expect(calls).toEqual([]);
		const [reply] = socket.replies();
		expect(reply).toMatchObject({ v: 2, callId: 'call-1', ok: false, exitCode: null });
		expect(reply?.['text']).toContain('rm-everything');
		expect(reply?.['text']).toContain('show, big');
		expect(socket.ended).toBe(true);
	});

	it.each([
		['inject token on a call_tool line', callLine({ token: INJECT_TOKEN })],
		['tool token on a v1 inject line', injectLine({ token: TOOL_TOKEN })],
		['unknown token on a call_tool line', callLine({ token: 'nope' })],
		['wrong executionId', callLine({ executionId: 'other' })],
	])('destroys the connection: %s', async (_name, payload) => {
		open();
		socket.feed(payload);
		await settle();
		expect(socket.destroyed).toBe(true);
		expect(socket.written).toEqual([]);
		expect(calls).toEqual([]);
		expect(injected).toEqual([]);
	});

	it('destroys a call_tool line when the step declares no tools (no tool bearer exists)', async () => {
		open(false);
		socket.feed(callLine());
		await settle();
		expect(socket.destroyed).toBe(true);
		expect(calls).toEqual([]);
	});

	it.each([
		['callId is not a string', callLine({ callId: 7 })],
		['callId is empty', callLine({ callId: '' })],
		['toolId is missing', callLine({ toolId: undefined })],
		['args is an array', callLine({ args: [] })],
		['args is missing', callLine({ args: undefined })],
		['token is missing', callLine({ token: undefined })],
		['malformed JSON', '{not json'],
		['a JSON array', '[]'],
	])('destroys a malformed line: %s', async (_name, payload) => {
		open();
		socket.feed(payload);
		await settle();
		expect(socket.destroyed).toBe(true);
		expect(calls).toEqual([]);
	});

	it.each([
		['unknown kind with v 2', { v: 2, kind: 'dance' }, true],
		['kind without v', { kind: 'call_tool' }, false],
		['unsupported v', { v: 3, kind: 'call_tool' }, false],
		['v 2 without kind', { v: 2 }, true],
	])('rejects loudly: %s', async (_name, payload, repliesInV2) => {
		open();
		socket.feed(payload);
		await settle();
		expect(logs.some(line => line.includes('rejected'))).toBe(true);
		expect(calls).toEqual([]);
		if (repliesInV2) {
			const [reply] = socket.replies();
			expect(reply).toMatchObject({ v: 2, ok: false });
			expect(String(reply?.['text'])).toContain('call_tool');
			expect(socket.ended).toBe(true);
		} else {
			expect(socket.written).toEqual([]);
			expect(socket.destroyed).toBe(true);
		}
	});

	it.each([
		['a second call', callLine({ callId: 'call-2' })],
		['an inject line', injectLine()],
		['garbage', 'x'],
	])('destroys the connection when %s arrives while a call is in flight', async (_name, payload) => {
		open();
		socket.feed(callLine());
		await settle();
		socket.feed(payload);
		expect(socket.destroyed).toBe(true);
		pending.resolve(okReply());
		await settle();
		expect(socket.written).toEqual([]);
		expect(injected).toEqual([]);
	});

	it('serves one call per connection: a second line after the reply is a violation', async () => {
		open();
		socket.feed(callLine());
		pending.resolve(okReply());
		await settle();
		expect(socket.ended).toBe(true);
		socket.feed(callLine({ callId: 'call-2' }));
		expect(socket.destroyed).toBe(true);
		expect(calls).toHaveLength(1);
	});

	it('answers timedOut when the per-call timer fires, and ignores the late handler result', async () => {
		open();
		socket.feed(callLine());
		await settle();
		socket.emit('timeout');
		await settle();
		const [reply] = socket.replies();
		expect(reply).toMatchObject({ v: 2, callId: 'call-1', ok: false, timedOut: true, exitCode: null });
		expect(String(reply?.['text'])).toContain('show');
		expect(socket.ended).toBe(true);
		pending.resolve(okReply('late'));
		await settle();
		expect(socket.written).toHaveLength(1);
	});

	it('closes an idle connection with no call in flight', () => {
		open();
		socket.emit('timeout');
		expect(socket.destroyed).toBe(true);
	});

	it('refuses a reply whose text exceeds the tool maxOutputBytes', async () => {
		open();
		socket.feed(callLine());
		await settle();
		pending.resolve(okReply('x'.repeat(101)));
		await settle();
		const [reply] = socket.replies();
		expect(reply).toMatchObject({ ok: false, exitCode: null });
		expect(String(reply?.['text'])).toContain('maxOutputBytes');
		expect(String(reply?.['text'])).not.toContain('xxxxxxxx');
	});

	it('refuses a reply whose JSON line would exceed the callback line cap even within maxOutputBytes', async () => {
		open();
		socket.feed(callLine({ toolId: 'big' }));
		await settle();
		// 1 MiB of quotes: within maxOutputBytes, but each one is escaped to two bytes.
		pending.resolve(okReply('"'.repeat(1_048_576)));
		await settle();
		expect(socket.written.every(line => line.length < MAX_CALLBACK_LINE_BYTES)).toBe(true);
		expect(socket.replies()[0]).toMatchObject({ ok: false });
	});

	it('answers an error, without the error text, when the handler throws', async () => {
		open();
		socket.feed(callLine());
		await settle();
		pending.reject(new Error('secret-detail-/etc/passwd'));
		await settle();
		const [reply] = socket.replies();
		expect(reply).toMatchObject({ v: 2, callId: 'call-1', ok: false, exitCode: null });
		expect(socket.written.join('')).not.toContain('secret-detail');
		expect(logs.join('')).not.toContain('secret-detail');
		expect(socket.ended).toBe(true);
	});

	it.each([
		['v1 inject line', injectLine()],
		['v2 call_tool line', callLine()],
	])('rejects a %s once the server is stopped (tokens are revoked)', async (_name, payload) => {
		open();
		revoked = true;
		socket.feed(payload);
		await settle();
		expect(socket.destroyed).toBe(true);
		expect(calls).toEqual([]);
		expect(injected).toEqual([]);
	});

	it('does not reply to a peer that closed while the call was in flight', async () => {
		open();
		socket.feed(callLine());
		await settle();
		socket.destroy();
		pending.resolve(okReply());
		await settle();
		expect(socket.written).toEqual([]);
	});

	describe('abort of the call in flight', () => {
		it.each([
			{
				name: 'the peer closes the socket',
				trigger: (): void => void socket.destroy(),
				reason: 'connection closed',
			},
			{
				name: 'the socket errors then closes',
				trigger: (): void => {
					socket.emit('error', new Error('ECONNRESET'));
					socket.destroy();
				},
				reason: 'connection closed',
			},
			{ name: 'the server stops', trigger: (): void => stop.abort('step ended'), reason: 'step ended' },
		])('$name: the handler signal aborts with "$reason", and no reply is written', async ({ trigger, reason }) => {
			open();
			socket.feed(callLine());
			await settle();
			expect(signals).toHaveLength(1);
			expect(signals[0]!.aborted).toBe(false);
			trigger();
			expect(signals[0]!.aborted).toBe(true);
			expect(signals[0]!.reason).toBe(reason);
			// The late result of the handler (it was told to stop) must not be written.
			pending.resolve(okReply('late'));
			await settle();
			expect(socket.written).toEqual([]);
			expect(socket.destroyed).toBe(true);
		});

		it('a call that finishes normally leaves its signal untouched, even if the socket closes later', async () => {
			open();
			socket.feed(callLine());
			await settle();
			pending.resolve(okReply());
			await settle();
			expect(socket.replies()).toHaveLength(1);
			socket.destroy();
			stop.abort('step ended');
			expect(signals[0]!.aborted).toBe(false);
		});

		it('stopping destroys an idle connection and rejects any later line, v1 inject included', () => {
			open();
			stop.abort('step ended');
			expect(socket.destroyed).toBe(true);
			expect(injected).toEqual([]);
		});

		it('a connection opened after the server stopped is destroyed at once', () => {
			stop.abort('step ended');
			open();
			expect(socket.destroyed).toBe(true);
		});
	});
});
