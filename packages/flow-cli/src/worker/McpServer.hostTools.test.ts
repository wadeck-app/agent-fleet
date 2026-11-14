import type { HostTool } from 'flow-engine';
import * as net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InjectedStep } from '../ipc/Protocol';
import type { HostToolCallHandler, HostToolCallRequest } from './HostToolCallTypes';
import { HostToolSetTooLargeError, McpServer } from './McpServer';

const COMMAND_CANARY = 'secret-binary-CANARY';

const tool = (id: string, overrides: Partial<HostTool> = {}): HostTool => ({
	id,
	description: `Shows ${id}.`,
	sideEffect: 'read',
	command: [COMMAND_CANARY, 'show', '{id}'],
	args: { id: { type: 'string', pattern: '^[a-z]+$', required: true } },
	timeoutSeconds: 7,
	...overrides,
});

describe('McpServer host tools over the callback', () => {
	let server: McpServer;
	let injected: InjectedStep[][];
	let calls: HostToolCallRequest[];
	let stderr: string[];
	let stderrSpy: ReturnType<typeof vi.spyOn>;
	const sockets: net.Socket[] = [];
	const handler: HostToolCallHandler = {
		call: async request => {
			calls.push(request);
			return { ok: true, text: `shown ${String(request.args['id'])}`, truncated: false, exitCode: 0 };
		},
	};

	const startWith = async (tools: readonly HostTool[]): Promise<{ port: number; env: Record<string, string> }> => {
		server = new McpServer(
			'exec-1',
			async steps => {
				injected.push(steps);
			},
			{ hostTools: { stepId: 'triage', tools, handler } }
		);
		const started = await server.start();
		return { port: started.port, env: started.mcpServer.env ?? {} };
	};

	/** Sends the lines on a fresh connection and resolves with everything the host answered until it closed it. */
	const exchange = (port: number, lines: unknown[]): Promise<string> =>
		new Promise(resolve => {
			const socket = net.createConnection(port, '127.0.0.1', () => {
				for (const line of lines) socket.write((typeof line === 'string' ? line : JSON.stringify(line)) + '\n');
			});
			sockets.push(socket);
			let received = '';
			socket.on('data', chunk => (received += chunk.toString('utf8')));
			socket.on('error', () => {});
			socket.on('close', () => resolve(received));
		});

	beforeEach(() => {
		injected = [];
		calls = [];
		stderr = [];
		stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
			stderr.push(String(chunk));
			return true;
		});
	});

	afterEach(async () => {
		for (const socket of sockets.splice(0)) socket.destroy();
		await server.stop().catch(() => {});
		stderrSpy.mockRestore();
	});

	it('issues no tool token and no tool list for a step without host tools', async () => {
		server = new McpServer('exec-1', async () => {});
		const { mcpServer } = await server.start();
		expect(Object.keys(mcpServer.env ?? {}).sort()).toEqual([
			'FLOW_EXECUTION_ID',
			'FLOW_MCP_CALLBACK_PORT',
			'FLOW_MCP_CALLBACK_TOKEN',
		]);
	});

	it('issues no tool token for an empty tool list', async () => {
		const { env } = await startWith([]);
		expect(env['FLOW_MCP_TOOL_TOKEN']).toBeUndefined();
		expect(env['FLOW_MCP_TOOLS']).toBeUndefined();
	});

	it('hands the helper the model view with the limits and never the command', async () => {
		const { env } = await startWith([tool('show'), tool('other')]);
		const listed = JSON.parse(env['FLOW_MCP_TOOLS'] as string) as Array<Record<string, unknown>>;
		expect(listed.map(entry => entry['name'])).toEqual(['show', 'other']);
		expect(listed[0]).toMatchObject({
			name: 'show',
			timeoutSeconds: 7,
			inputSchema: { type: 'object', required: ['id'] },
		});
		expect(Object.keys(listed[0] ?? {}).sort()).toEqual(['description', 'inputSchema', 'name', 'timeoutSeconds']);
		expect(JSON.stringify(env)).not.toContain(COMMAND_CANARY);
		expect(env['FLOW_MCP_TOOL_TOKEN']).toBeTruthy();
		expect(env['FLOW_MCP_TOOL_TOKEN']).not.toBe(env['FLOW_MCP_CALLBACK_TOKEN']);
	});

	it('uses the default timeout for a tool that declares none', async () => {
		const { env } = await startWith([tool('show', { timeoutSeconds: undefined })]);
		const [entry] = JSON.parse(env['FLOW_MCP_TOOLS'] as string) as Array<Record<string, unknown>>;
		expect(entry?.['timeoutSeconds']).toBe(30);
	});

	it('serves a declared call with the tool token and answers on the same socket', async () => {
		const { port, env } = await startWith([tool('show')]);
		const answer = await exchange(port, [
			{
				v: 2,
				kind: 'call_tool',
				token: env['FLOW_MCP_TOOL_TOKEN'],
				executionId: 'exec-1',
				callId: 'c1',
				toolId: 'show',
				args: { id: 'abc' },
			},
		]);
		expect(JSON.parse(answer.trim())).toEqual({
			v: 2,
			callId: 'c1',
			ok: true,
			text: 'shown abc',
			truncated: false,
			exitCode: 0,
		});
		expect(calls).toHaveLength(1);
	});

	it.each([
		[
			'the inject token on call_tool',
			(env: Record<string, string>) => ({ v: 2, kind: 'call_tool', token: env['FLOW_MCP_CALLBACK_TOKEN'] }),
		],
		[
			'the tool token on inject',
			(env: Record<string, string>) => ({ token: env['FLOW_MCP_TOOL_TOKEN'], steps: [{ id: 'x' }] }),
		],
	])('refuses %s and does not log either token', async (_name, build) => {
		const { port, env } = await startWith([tool('show')]);
		const base = { executionId: 'exec-1', callId: 'c1', toolId: 'show', args: { id: 'abc' } };
		const answer = await exchange(port, [{ ...base, ...build(env) }]);
		expect(answer).toBe('');
		expect(calls).toEqual([]);
		expect(injected).toEqual([]);
		const logged = stderr.join('');
		expect(logged).toContain('rejected');
		expect(logged).not.toContain(env['FLOW_MCP_TOOL_TOKEN']);
		expect(logged).not.toContain(env['FLOW_MCP_CALLBACK_TOKEN']);
	});

	it('does not issue a call_tool bearer for a step without tools', async () => {
		server = new McpServer('exec-1', async () => {});
		const started = await server.start();
		const answer = await exchange(started.port, [
			{ v: 2, kind: 'call_tool', token: 'guess', executionId: 'exec-1', callId: 'c1', toolId: 'show', args: {} },
		]);
		expect(answer).toBe('');
	});

	it('keeps serving a valid v1 inject on another connection after an unknown kind was rejected', async () => {
		const { port, env } = await startWith([tool('show')]);
		const refused = await exchange(port, [{ v: 2, kind: 'dance' }]);
		expect(JSON.parse(refused.trim())).toMatchObject({ v: 2, ok: false });
		// A v1 sender ends its socket after the line and never reads: poll the effect.
		const v1 = net.createConnection(port, '127.0.0.1');
		sockets.push(v1);
		v1.on('error', () => {});
		v1.end(
			JSON.stringify({
				token: env['FLOW_MCP_CALLBACK_TOKEN'],
				executionId: 'exec-1',
				steps: [{ id: 'a', type: 'script', script: 'echo' }],
			}) + '\n'
		);
		await vi.waitFor(() => expect(injected).toHaveLength(1));
	});

	it.each([
		[
			'more than 16 tools',
			Array.from({ length: 17 }, (_unused, index) => tool(`tool-${index}`)),
			/17 tools.*limit is 16/,
		],
		[
			'a description set over 16384 bytes',
			[tool('big', { description: 'x'.repeat(17_000) })],
			/host tools description is \d+ bytes, the limit is 16384/,
		],
	])('fails loudly at start with a named error for %s', async (_name, tools, message) => {
		server = new McpServer('exec-1', async () => {}, { hostTools: { stepId: 'triage', tools, handler } });
		const failure = await server.start().then(
			() => null,
			(error: unknown) => error
		);
		expect(failure).toBeInstanceOf(HostToolSetTooLargeError);
		expect((failure as Error).name).toBe('HostToolSetTooLargeError');
		expect((failure as Error).message).toMatch(message);
		expect((failure as Error).message).toContain("Step 'triage'");
		expect((failure as Error).message).toContain('Fix:');
	});

	it('revokes both tokens on stop()', async () => {
		const { port, env } = await startWith([tool('show')]);
		const socket = await new Promise<net.Socket>(resolve => {
			const opened = net.createConnection(port, '127.0.0.1', () => resolve(opened));
			opened.on('error', () => {});
			sockets.push(opened);
		});
		const stopping = server.stop();
		socket.write(
			JSON.stringify({ token: env['FLOW_MCP_CALLBACK_TOKEN'], executionId: 'exec-1', steps: [{ id: 'late' }] }) +
				'\n'
		);
		await new Promise<void>(resolve => socket.once('close', () => resolve()));
		await stopping;
		expect(injected).toEqual([]);
	});
});
