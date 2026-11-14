import { McpServer } from 'flow-cli/worker/McpServer';
import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ObservedList } from '../testing/ObservedList';
import { ImageMcpServerStager } from './ImageMcpServerStager';

/**
 * T-01 / T-08 in the exec variant: "the sandbox cannot add steps" except where today's engine lets a model do it.
 * These tests run the engine's REAL pieces on the host: `McpServer` (the callback server), the unmodified
 * `mcp-server.cjs`, and the image's `mcp-callback-forwarder.cjs`. What they cannot cover is the network hop from the VM
 * (host.docker.internal, the sbx proxy and the per-step rule): that is the live check.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..', '..');
const engineMcpServer = path.resolve(packageRoot, '..', 'flow-cli', 'src', 'worker', 'mcp-server.cjs');
const forwarderSource = path.join(packageRoot, 'image', 'mcp-callback-forwarder.cjs');
/** The image's mcp-server.cjs, produced by the code BuildInnerBundles.mjs uses for image/opt-flow, into a temp directory. */
let imageMcpServer: string;
let imageBuildDirectory: string;

beforeAll(() => {
	imageBuildDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-mcp-image-'));
	try {
		imageMcpServer = new ImageMcpServerStager(path.resolve(packageRoot, '..', 'flow-cli')).stageInto(
			imageBuildDirectory
		);
	} catch (error) {
		throw new Error(
			`Cannot produce the image's mcp-server.cjs for this test: ${error instanceof Error ? error.message : String(error)}`,
			{
				cause: error,
			}
		);
	}
});

afterAll(() => {
	fs.rmSync(imageBuildDirectory, { recursive: true, force: true });
});

const STEPS = [{ id: 'extra', type: 'script', script: 'echo injected' }];

let root: string;
let children: ChildProcess[];
let servers: McpServer[];
let relays: net.Server[];
/** The `[McpServer] ...` lines the engine's callback server wrote to stderr: its way to say it dropped a connection. */
let engineStderr: ObservedList<string>;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-mcp-invariant-')));
	children = [];
	servers = [];
	relays = [];
	const ownLines = new ObservedList<string>();
	engineStderr = ownLines;
	const write = process.stderr.write.bind(process.stderr);
	// Captured instead of printed (the rejections are expected here); any other stderr output passes through.
	vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array, ...rest: unknown[]) => {
		if (typeof chunk === 'string' && chunk.startsWith('[McpServer]')) {
			ownLines.push(chunk);
			return true;
		}
		return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
	}) as typeof process.stderr.write);
});

afterEach(async () => {
	vi.restoreAllMocks();
	for (const child of children) child.kill();
	for (const server of servers) await server.stop().catch(() => undefined);
	for (const relay of relays) relay.close();
	fs.rmSync(root, { recursive: true, force: true });
});

/** Starts the engine's callback server like WorkerAdapter does for a model step. */
async function startEngineServer(executionId: string): Promise<{
	port: number;
	token: string;
	injected: ObservedList<unknown[]>;
	server: McpServer;
}> {
	const injected = new ObservedList<unknown[]>();
	const server = new McpServer(executionId, steps => {
		injected.push(steps);
		return Promise.resolve();
	});
	servers.push(server);
	const { port, mcpServer } = await server.start();
	return { port, token: mcpServer.env?.['FLOW_MCP_CALLBACK_TOKEN'] ?? '', injected, server };
}

/** A JSON-RPC session with a stdio MCP process, one request at a time. */
class StdioSession {
	private buffer = '';
	private readonly waiting = new Map<number, (message: Record<string, unknown>) => void>();
	private nextId = 1;
	stderr = '';

	constructor(readonly child: ChildProcess) {
		children.push(child);
		child.stdout?.on('data', (data: Buffer) => {
			this.buffer += data.toString();
			let newline: number;
			while ((newline = this.buffer.indexOf('\n')) !== -1) {
				const line = this.buffer.slice(0, newline);
				this.buffer = this.buffer.slice(newline + 1);
				if (line.trim() === '') continue;
				const message = JSON.parse(line) as Record<string, unknown>;
				this.waiting.get(message['id'] as number)?.(message);
			}
		});
		child.stderr?.on('data', (data: Buffer) => (this.stderr += data.toString()));
	}

	request(method: string, params?: unknown): Promise<Record<string, unknown>> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			// A process that ends without answering is reported with its stderr; one that stays silent is reported by the test timeout.
			this.child.once('close', () =>
				reject(new Error(`the process ended before answering ${method}; stderr: ${this.stderr}`))
			);
			this.waiting.set(id, resolve);
			this.child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
		});
	}
}

function startMcp(script: string, env: Record<string, string>): StdioSession {
	return new StdioSession(
		spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
	);
}

/** Mirrors /opt/flow in the image: the forwarder next to the unmodified mcp-server.cjs. */
function installImageFiles(): string {
	const directory = path.join(root, 'opt-flow');
	fs.mkdirSync(directory);
	fs.copyFileSync(forwarderSource, path.join(directory, 'mcp-callback-forwarder.cjs'));
	fs.copyFileSync(engineMcpServer, path.join(directory, 'mcp-server.cjs'));
	return path.join(directory, 'mcp-callback-forwarder.cjs');
}

/**
 * Writes raw callback lines on a new connection, as any process that knows the port could. `closed` resolves when the
 * connection ends (the server dropped it, or nothing listens); `isClosed` tells whether that already happened.
 */
function rawCallback(
	port: number,
	lines: string[]
): { closed: Promise<void>; isClosed: () => boolean; end: () => void } {
	let ended = false;
	const socket = net.connect(port, '127.0.0.1', () => {
		for (const line of lines) socket.write(`${line}\n`);
	});
	const closed = new Promise<void>(resolve => {
		socket.on('close', () => {
			ended = true;
			resolve();
		});
	});
	socket.on('error', () => undefined);
	return { closed, isClosed: () => ended, end: () => socket.destroy() };
}

/**
 * A TCP relay to the engine's callback server that records every connection the ENGINE side closed: the event a
 * protocol violation produces (the server destroys the socket), observed without relying on any log text.
 */
async function startClosingRelay(enginePort: number): Promise<{ port: number; closedByEngine: ObservedList<true> }> {
	const closedByEngine = new ObservedList<true>();
	const server = net.createServer(client => {
		const engineSide = net.connect(enginePort, '127.0.0.1');
		engineSide.on('close', () => {
			closedByEngine.push(true);
			client.destroy();
		});
		engineSide.on('error', () => undefined);
		client.on('error', () => engineSide.destroy());
		client.pipe(engineSide);
		engineSide.pipe(client);
	});
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	relays.push(server);
	return { port: (server.address() as net.AddressInfo).port, closedByEngine };
}

function sha256(file: string): string {
	return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

describe('the MCP tool surface the sandbox gets', () => {
	it('is the single tool provideSteps, the same as a local model gets', async () => {
		const session = startMcp(engineMcpServer, {});
		await session.request('initialize', {});
		const listed = (await session.request('tools/list')) as { result: { tools: { name: string }[] } };
		expect(listed.result.tools.map(tool => tool.name)).toEqual(['provideSteps']);
		const other = (await session.request('tools/call', { name: 'runShell', arguments: {} })) as {
			error: { message: string };
		};
		expect(other.error.message).toMatch(/Unknown tool: runShell\. Available tools: provideSteps/);
	});

	it('is served by a file identical to the one in the image build context (a stale image would be a different surface)', () => {
		expect(sha256(imageMcpServer)).toBe(sha256(engineMcpServer));
	});
});

describe('the path from the sandbox to the engine: forwarder, unmodified mcp-server.cjs, real McpServer', () => {
	it('lets a model step inject steps with the right token and execution id (allowed today, nothing more)', async () => {
		const engine = await startEngineServer('run-1');
		const session = startMcp(installImageFiles(), {
			FLOW_MCP_UPSTREAM_HOST: '127.0.0.1',
			FLOW_MCP_UPSTREAM_PORT: String(engine.port),
			FLOW_MCP_CALLBACK_TOKEN: engine.token,
			FLOW_EXECUTION_ID: 'run-1',
		});
		await session.request('initialize', {});
		const result = (await session.request('tools/call', {
			name: 'provideSteps',
			arguments: { steps: STEPS },
		})) as { result: { structuredContent?: { injected: string[] }; isError?: boolean } };
		expect(result.result.isError).toBeUndefined();
		expect(result.result.structuredContent).toEqual({ injected: ['extra'] });
		await engine.injected.waitForCount(1);
		expect(engine.injected.items[0]).toEqual(STEPS);
	});

	it('relays a host tool call (callback protocol v2) and its reply byte for byte, without a forwarder change', async () => {
		const calls: unknown[] = [];
		const server = new McpServer('run-1', () => Promise.resolve(), {
			hostTools: {
				stepId: 'triage',
				tools: [
					{
						id: 'show',
						description: 'Show a thing.',
						sideEffect: 'read',
						command: ['never-sent-to-the-vm', '{id}'],
						args: { id: { type: 'string', pattern: '^[a-z]+$', required: true } },
					},
				],
				handler: {
					call: request => {
						calls.push(request);
						return Promise.resolve({ ok: true, text: 'shown', truncated: false, exitCode: 0 });
					},
				},
			},
		});
		servers.push(server);
		const { port, mcpServer } = await server.start();
		const session = startMcp(installImageFiles(), {
			FLOW_MCP_UPSTREAM_HOST: '127.0.0.1',
			FLOW_MCP_UPSTREAM_PORT: String(port),
			FLOW_MCP_CALLBACK_TOKEN: mcpServer.env?.['FLOW_MCP_CALLBACK_TOKEN'] ?? '',
			FLOW_MCP_TOOL_TOKEN: mcpServer.env?.['FLOW_MCP_TOOL_TOKEN'] ?? '',
			FLOW_MCP_TOOLS: mcpServer.env?.['FLOW_MCP_TOOLS'] ?? '',
			FLOW_EXECUTION_ID: 'run-1',
		});
		await session.request('initialize', {});
		const result = (await session.request('tools/call', { name: 'show', arguments: { id: 'abc' } })) as {
			result: { content: { text: string }[]; isError?: boolean };
		};
		expect(result.result).toEqual({ content: [{ type: 'text', text: 'shown' }] });
		expect(calls).toMatchObject([{ executionId: 'run-1', toolId: 'show', args: { id: 'abc' } }]);
	});

	it('does not carry a forged token or execution id: the engine drops the connection and injects nothing', async () => {
		const engine = await startEngineServer('run-1');
		// The forwarder dials this relay, which dials the engine and reports each connection the ENGINE side closed.
		const relay = await startClosingRelay(engine.port);
		const wrongToken = startMcp(installImageFiles(), {
			FLOW_MCP_UPSTREAM_HOST: '127.0.0.1',
			FLOW_MCP_UPSTREAM_PORT: String(relay.port),
			FLOW_MCP_CALLBACK_TOKEN: 'not-the-token',
			FLOW_EXECUTION_ID: 'run-1',
		});
		await wrongToken.request('initialize', {});
		await wrongToken.request('tools/call', { name: 'provideSteps', arguments: { steps: STEPS } });
		const wrongExecution = startMcp(path.join(root, 'opt-flow', 'mcp-callback-forwarder.cjs'), {
			FLOW_MCP_UPSTREAM_HOST: '127.0.0.1',
			FLOW_MCP_UPSTREAM_PORT: String(relay.port),
			FLOW_MCP_CALLBACK_TOKEN: engine.token,
			FLOW_EXECUTION_ID: 'another-run',
		});
		await wrongExecution.request('initialize', {});
		await wrongExecution.request('tools/call', { name: 'provideSteps', arguments: { steps: STEPS } });
		// The engine closed both connections (a protocol violation destroys the socket); neither injected anything.
		await relay.closedByEngine.waitForCount(2);
		expect(engine.injected.items).toEqual([]);
	});

	// The callback server now destroys a connection at the first protocol violation. The forwarder must pass that on in
	// both directions, once, and never reconnect on its own.
	it('passes a destroyed connection on to the caller, and a closed caller on to the upstream, without reconnecting', async () => {
		const upstream = { connections: 0, closedByForwarder: 0 };
		const server = net.createServer(socket => {
			upstream.connections += 1;
			socket.on('close', () => (upstream.closedByForwarder += 1));
			// First connection: a protocol violation, destroyed at once. Second: stays open until the forwarder closes it.
			if (upstream.connections === 1) socket.on('data', () => socket.destroy());
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
		try {
			const directory = path.join(root, 'opt-flow');
			fs.mkdirSync(directory);
			fs.copyFileSync(forwarderSource, path.join(directory, 'mcp-callback-forwarder.cjs'));
			// Stands for mcp-server.cjs: reports the local port the forwarder opened, then stays alive.
			fs.writeFileSync(
				path.join(directory, 'mcp-server.cjs'),
				'process.stdout.write(process.env.FLOW_MCP_CALLBACK_PORT + "\\n"); setInterval(() => undefined, 1000);'
			);
			const child = spawn(process.execPath, [path.join(directory, 'mcp-callback-forwarder.cjs')], {
				env: {
					...process.env,
					FLOW_MCP_UPSTREAM_HOST: '127.0.0.1',
					FLOW_MCP_UPSTREAM_PORT: String((server.address() as net.AddressInfo).port),
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			children.push(child);
			const port = await new Promise<number>(resolve =>
				child.stdout?.once('data', (data: Buffer) => resolve(Number(data.toString().trim())))
			);

			const garbage = rawCallback(port, ['not json']);
			await garbage.closed;
			expect(upstream).toEqual({ connections: 1, closedByForwarder: 1 });

			const second = rawCallback(port, []);
			await new Promise(resolve => setTimeout(resolve, 200));
			expect(upstream.connections).toBe(2);
			second.end();
			await vi.waitFor(() => expect(upstream.closedByForwarder).toBe(2));
			// No reconnection of its own after either end went away.
			await new Promise(resolve => setTimeout(resolve, 300));
			expect(upstream.connections).toBe(2);
		} finally {
			server.close();
		}
	});

	it('refuses to start without its upstream, naming the missing variable', async () => {
		const forwarder = installImageFiles();
		const child = spawn(process.execPath, [forwarder], {
			env: { ...process.env },
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		children.push(child);
		let stderr = '';
		child.stderr?.on('data', (data: Buffer) => (stderr += data.toString()));
		const code = await new Promise<number | null>(resolve => child.on('close', resolve));
		expect(code).toBe(1);
		expect(stderr).toMatch(/FLOW_MCP_UPSTREAM_HOST is missing or invalid/);
	});
});

describe('the callback server itself, reached as any process that knows the port would', () => {
	// Any protocol violation destroys the socket (flow-cli McpCallbackConnection); the close is the event, no text is relied on.
	it('closes the connection on every protocol violation, injects nothing, and still serves a valid caller afterwards', async () => {
		const engine = await startEngineServer('run-1');
		const valid = { token: engine.token, executionId: 'run-1', steps: STEPS };
		const violations: [string, string[]][] = [
			['invalid JSON', ['not json']],
			['a truncated object', ['{"truncated":']],
			['null', ['null']],
			['a number', ['5']],
			['an array', ['[]']],
			['a wrong token', [JSON.stringify({ ...valid, token: 'x' })]],
			['a wrong execution id', [JSON.stringify({ ...valid, executionId: 'run-2' })]],
			['a line over the size cap', ['x'.repeat(2 * 1024 * 1024 + 1024)]],
		];

		for (const [label, lines] of violations) {
			const closed = await Promise.race([
				rawCallback(engine.port, lines).closed.then(() => true),
				new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
			]);
			expect(closed, `${label}: the server must destroy the connection`).toBe(true);
		}
		expect(engine.injected.items).toEqual([]);

		const callback = rawCallback(engine.port, [JSON.stringify(valid)]);
		await engine.injected.waitForCount(1);
		expect(engine.injected.items[0]).toEqual(STEPS);
		callback.end();
	});

	it('is closed when no model step runs: a script step (or the end of the step) finds nothing to talk to', async () => {
		const engine = await startEngineServer('run-1');
		await engine.server.stop();
		await rawCallback(engine.port, ['{}']).closed;
		const refused = await new Promise<string>(resolve => {
			const socket = net.connect(engine.port, '127.0.0.1');
			socket.on('connect', () => {
				socket.destroy();
				resolve('connected');
			});
			socket.on('error', error => resolve((error as NodeJS.ErrnoException).code ?? 'error'));
		});
		expect(refused).toBe('ECONNREFUSED');
	});
});
