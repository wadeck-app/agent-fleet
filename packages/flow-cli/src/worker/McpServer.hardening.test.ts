import * as net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InjectedStep } from '../ipc/Protocol';
import { McpServer } from './McpServer';

describe('McpServer TCP callback hardening', () => {
	let server: McpServer;
	let injectedSteps: InjectedStep[][];
	let port: number;
	let token: string;
	let stderrSpy: ReturnType<typeof vi.spyOn>;
	const sockets: net.Socket[] = [];

	const connect = (): Promise<net.Socket> =>
		new Promise((resolve, reject) => {
			const socket = net.createConnection(port, '127.0.0.1', () => resolve(socket));
			socket.once('error', reject);
			// Hostile-input tests expect the server to reset connections: swallow errors after connect.
			socket.on('error', () => {});
			sockets.push(socket);
		});

	const closed = (socket: net.Socket): Promise<void> =>
		new Promise(resolve => {
			if (socket.destroyed) resolve();
			else socket.once('close', () => resolve());
		});

	const sendRaw = async (raw: string): Promise<net.Socket> => {
		const socket = await connect();
		socket.write(raw);
		return socket;
	};

	const validLine = (id: string, overrides: Record<string, unknown> = {}): string =>
		JSON.stringify({
			token,
			executionId: 'test-exec',
			steps: [{ id, type: 'script', script: 'echo' }],
			...overrides,
		}) + '\n';

	const expectStillAcceptsValid = async (): Promise<void> => {
		const before = injectedSteps.length;
		const socket = await sendRaw(validLine('after-hostile'));
		socket.end();
		await vi.waitFor(() => expect(injectedSteps.length).toBe(before + 1));
	};

	const startWith = async (
		onInject: (steps: InjectedStep[]) => Promise<void>,
		options?: ConstructorParameters<typeof McpServer>[2]
	): Promise<void> => {
		server = new McpServer('test-exec', onInject, options);
		const started = await server.start();
		port = started.port;
		token = started.mcpServer.env?.['FLOW_MCP_CALLBACK_TOKEN'] as string;
	};

	const start = (options?: ConstructorParameters<typeof McpServer>[2]): Promise<void> =>
		startWith(async steps => {
			injectedSteps.push(steps);
		}, options);

	const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

	beforeEach(() => {
		injectedSteps = [];
		stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(async () => {
		for (const socket of sockets.splice(0)) socket.destroy();
		await server.stop().catch(() => {});
		stderrSpy.mockRestore();
	});

	it.each([
		['null', 'null\n'],
		['number', '5\n'],
		['string', '"x"\n'],
		['array', '[]\n'],
		['empty object', '{}\n'],
		['invalid JSON', '{not json\n'],
		['steps not an array', 'STEPS_NOT_ARRAY'],
		['steps null', 'STEPS_NULL'],
		['steps item not an object', 'STEPS_BAD_ITEM'],
		['steps item without id', 'STEPS_NO_ID'],
		['token not a string', 'TOKEN_NUMBER'],
		['executionId not a string', 'EXEC_NUMBER'],
		['wrong token', 'WRONG_TOKEN'],
		['wrong executionId', 'WRONG_EXEC'],
	])('hostile input (%s): destroys the socket, injects nothing, server survives', async (_name, raw) => {
		await start();
		const lines: Record<string, string> = {
			STEPS_NOT_ARRAY: validLine('x', { steps: 'nope' }),
			STEPS_NULL: validLine('x', { steps: null }),
			STEPS_BAD_ITEM: validLine('x', { steps: [5] }),
			STEPS_NO_ID: validLine('x', { steps: [{ type: 'script' }] }),
			TOKEN_NUMBER: validLine('x', { token: 5 }),
			EXEC_NUMBER: validLine('x', { executionId: 5 }),
			WRONG_TOKEN: validLine('x', { token: 'WRONG' }),
			WRONG_EXEC: validLine('x', { executionId: 'WRONG' }),
		};
		const socket = await sendRaw(lines[raw] ?? raw);
		await closed(socket);
		expect(injectedSteps).toHaveLength(0);
		await expectStillAcceptsValid();
	});

	it('never writes the token or payload content to stderr', async () => {
		await start();
		const socket = await sendRaw(validLine('SECRET_PAYLOAD_MARKER', { token: 'WRONG_SECRET_TOKEN', steps: 'x' }));
		await closed(socket);
		const socket2 = await sendRaw('{SECRET_PAYLOAD_MARKER\n');
		await closed(socket2);
		const socket3 = await sendRaw(validLine('SECRET_PAYLOAD_MARKER', { steps: 'x' }));
		await closed(socket3);
		const socket4 = await sendRaw(validLine('SECRET_PAYLOAD_MARKER', { executionId: 'SECRET_EXEC_MARKER' }));
		await closed(socket4);
		const logged = stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('');
		expect(logged.length).toBeGreaterThan(0);
		expect(logged).not.toContain('SECRET_PAYLOAD_MARKER');
		expect(logged).not.toContain('SECRET_EXEC_MARKER');
		expect(logged).not.toContain('WRONG_SECRET_TOKEN');
		expect(logged).not.toContain(token);
	});

	it('hostile null line does not raise a process-level uncaughtException', async () => {
		await start();
		const uncaught: unknown[] = [];
		const listener = (err: unknown): void => {
			uncaught.push(err);
		};
		process.on('uncaughtException', listener);
		try {
			const socket = await sendRaw('null\n');
			await closed(socket);
			// Let any asynchronous event-handler throw surface.
			await settle();
		} finally {
			process.off('uncaughtException', listener);
		}
		expect(uncaught).toEqual([]);
	});

	it('destroys a connection streaming 3 MiB without a newline', async () => {
		await start();
		const socket = await connect();
		const chunk = 'a'.repeat(64 * 1024);
		const writer = setInterval(() => {
			if (!socket.destroyed) socket.write(chunk);
		}, 1);
		try {
			await closed(socket);
		} finally {
			clearInterval(writer);
		}
		expect(injectedSteps).toHaveLength(0);
		await expectStillAcceptsValid();
	});

	it('destroys a connection sending one over-long line even when terminated', async () => {
		await start();
		const socket = await sendRaw('a'.repeat(3 * 1024 * 1024) + '\n');
		await closed(socket);
		await expectStillAcceptsValid();
	});

	it('closes an idle connection after the idle timeout', async () => {
		await start({ idleTimeoutMs: 100 });
		const socket = await connect();
		await closed(socket);
		await expectStillAcceptsValid();
	});

	it('rejects the connection beyond the concurrent limit', async () => {
		await start({ maxConnections: 8 });
		const held: net.Socket[] = [];
		for (let i = 0; i < 8; i++) held.push(await connect());
		const ninth = await connect();
		await closed(ninth);
		for (const socket of held) expect(socket.destroyed).toBe(false);
		for (const socket of held) socket.destroy();
		// Slots are released once the held sockets are gone.
		await vi.waitFor(
			async () => {
				const before = injectedSteps.length;
				const socket = await sendRaw(validLine('later'));
				socket.end();
				await vi.waitFor(() => expect(injectedSteps.length).toBe(before + 1), { timeout: 200 });
			},
			{ timeout: 3000 }
		);
	});

	it('processes a valid payload', async () => {
		await start();
		const socket = await sendRaw(validLine('ok'));
		socket.end();
		await vi.waitFor(() => expect(injectedSteps).toHaveLength(1));
		expect(injectedSteps[0]).toEqual([{ id: 'ok', type: 'script', script: 'echo' }]);
	});

	it('processes a line split across chunks', async () => {
		await start();
		const line = validLine('split');
		const socket = await connect();
		socket.write(line.slice(0, 20));
		await settle();
		socket.write(line.slice(20));
		socket.end();
		await vi.waitFor(() => expect(injectedSteps).toHaveLength(1));
	});

	it('processes two valid lines in one chunk', async () => {
		await start();
		const socket = await sendRaw(validLine('a') + validLine('b'));
		socket.end();
		await vi.waitFor(() => expect(injectedSteps).toHaveLength(2));
	});

	it('a synchronously throwing onInjectSteps does not crash: socket destroyed, server survives', async () => {
		await startWith(() => {
			throw new Error('sync boom');
		});
		const uncaught: unknown[] = [];
		const listener = (err: unknown): void => {
			uncaught.push(err);
		};
		process.on('uncaughtException', listener);
		try {
			const socket = await sendRaw(validLine('x'));
			await closed(socket);
			await settle();
		} finally {
			process.off('uncaughtException', listener);
		}
		expect(uncaught).toEqual([]);
	});
});
