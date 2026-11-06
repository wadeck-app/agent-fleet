import { McpServer } from 'flow-cli/worker/McpServer';
import { type ChildProcess, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ObservedList } from '../testing/ObservedList';

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
const imageMcpServer = path.join(packageRoot, 'image', 'opt-flow', 'mcp-server.cjs');

const STEPS = [{ id: 'extra', type: 'script', script: 'echo injected' }];

let root: string;
let children: ChildProcess[];
let servers: McpServer[];
/** The `[McpServer] ...` lines the engine's callback server wrote to stderr: its way to say it dropped a connection. */
let engineStderr: ObservedList<string>;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-mcp-invariant-')));
	children = [];
	servers = [];
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
		if (!fs.existsSync(imageMcpServer)) {
			throw new Error(
				`${imageMcpServer} does not exist: run \`node --import tsx packages/flow-sandbox/scripts/BuildInnerBundles.mjs\` before the tests.`
			);
		}
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

	it('does not carry a forged token or execution id: the engine drops the connection and injects nothing', async () => {
		const engine = await startEngineServer('run-1');
		const wrongToken = startMcp(installImageFiles(), {
			FLOW_MCP_UPSTREAM_HOST: '127.0.0.1',
			FLOW_MCP_UPSTREAM_PORT: String(engine.port),
			FLOW_MCP_CALLBACK_TOKEN: 'not-the-token',
			FLOW_EXECUTION_ID: 'run-1',
		});
		await wrongToken.request('initialize', {});
		await wrongToken.request('tools/call', { name: 'provideSteps', arguments: { steps: STEPS } });
		const wrongExecution = startMcp(path.join(root, 'opt-flow', 'mcp-callback-forwarder.cjs'), {
			FLOW_MCP_UPSTREAM_HOST: '127.0.0.1',
			FLOW_MCP_UPSTREAM_PORT: String(engine.port),
			FLOW_MCP_CALLBACK_TOKEN: engine.token,
			FLOW_EXECUTION_ID: 'another-run',
		});
		await wrongExecution.request('initialize', {});
		await wrongExecution.request('tools/call', { name: 'provideSteps', arguments: { steps: STEPS } });
		// The engine says it dropped each connection: both were processed, and neither injected anything.
		await engineStderr.waitFor(
			lines =>
				lines.some(line => line.includes('rejected -- invalid token')) &&
				lines.some(line => line.includes('rejected -- executionId mismatch'))
		);
		expect(engine.injected.items).toEqual([]);
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
	it('rejects a wrong token and a wrong execution id, ignores garbage, and injects nothing', async () => {
		const engine = await startEngineServer('run-1');
		// The server drops these connections: the close is the event.
		await rawCallback(engine.port, [JSON.stringify({ token: 'x', executionId: 'run-1', steps: STEPS })]).closed;
		await rawCallback(engine.port, [JSON.stringify({ token: engine.token, executionId: 'run-2', steps: STEPS })])
			.closed;
		// Garbage is ignored and the connection stays open: the server says so for each line, and the socket is still open.
		const garbage = rawCallback(engine.port, ['not json', '{"truncated":']);
		await engineStderr.waitFor(lines => lines.filter(line => line.includes('invalid JSON payload')).length >= 2);
		expect(garbage.isClosed()).toBe(false);
		garbage.end();
		expect(engine.injected.items).toEqual([]);
	});

	it('accepts the right token and execution id (this is the tool surface of a model step, not a bypass)', async () => {
		const engine = await startEngineServer('run-1');
		const callback = rawCallback(engine.port, [
			JSON.stringify({ token: engine.token, executionId: 'run-1', steps: STEPS }),
		]);
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
