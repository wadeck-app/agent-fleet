import * as net from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { McpStdioTestClient } from '../test-utils/McpStdioTestClient';

const SERVER_PATH = fileURLToPath(new URL('./mcp-server.cjs', import.meta.url));
const COMMAND_CANARY = 'secret-binary-CANARY';
const TOOL_TOKEN = 'tool-token-for-test';

const SHOW = {
	name: 'queue-task-show',
	description: 'Show a task (side effect: read).',
	inputSchema: {
		type: 'object',
		properties: { id: { type: 'string' } },
		required: ['id'],
		additionalProperties: false,
	},
	timeoutSeconds: 5,
};

/** How the fake host callback behaves for one connection. */
type HostBehaviour = (socket: net.Socket, line: Record<string, unknown>) => void;

describe('mcp-server.cjs host tools over stdio', () => {
	let host: net.Server;
	let hostPort: number;
	let requests: Array<Record<string, unknown>>;
	let rawLines: string[];
	let behaviour: HostBehaviour;
	let client: McpStdioTestClient | null;

	const answerOk: HostBehaviour = (socket, line) => {
		socket.write(
			JSON.stringify({
				v: 2,
				callId: line['callId'],
				ok: true,
				text: 'task T1: open',
				truncated: false,
				exitCode: 0,
			}) + '\n'
		);
		socket.end();
	};

	beforeEach(async () => {
		requests = [];
		rawLines = [];
		behaviour = answerOk;
		client = null;
		host = net.createServer(socket => {
			let buffer = '';
			socket.on('error', () => {});
			socket.on('data', chunk => {
				buffer += chunk.toString('utf8');
				const newline = buffer.indexOf('\n');
				if (newline === -1) return;
				const text = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				rawLines.push(text);
				const line = JSON.parse(text) as Record<string, unknown>;
				requests.push(line);
				behaviour(socket, line);
			});
		});
		await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve));
		hostPort = (host.address() as net.AddressInfo).port;
	});

	afterEach(async () => {
		client?.kill();
		await new Promise<void>(resolve => host.close(() => resolve()));
	});

	const startHelper = (env: Record<string, string> = {}): McpStdioTestClient => {
		client = new McpStdioTestClient([process.execPath, SERVER_PATH], {
			...process.env,
			FLOW_MCP_CALLBACK_PORT: String(hostPort),
			FLOW_MCP_CALLBACK_TOKEN: 'inject-token',
			FLOW_MCP_TOOL_TOKEN: TOOL_TOKEN,
			FLOW_EXECUTION_ID: 'exec-1',
			FLOW_MCP_TOOLS: JSON.stringify([SHOW]),
			...env,
		});
		return client;
	};

	/** Sends one JSON-RPC request and resolves with the response carrying its id. */
	const rpc = async (method: string, params: unknown): Promise<Record<string, any>> => {
		if (client === null) throw new Error('startHelper() must be called before rpc()');
		return (await client.request(method, params)) as Record<string, any>;
	};

	it('lists provideSteps then the step tools, and never a command', async () => {
		startHelper();
		const response = await rpc('tools/list', {});
		const names = response['result'].tools.map((tool: { name: string }) => tool.name);
		expect(names).toEqual(['provideSteps', 'queue-task-show']);
		expect(Object.keys(response['result'].tools[1]).sort()).toEqual(['description', 'inputSchema', 'name']);
		expect(client?.everythingWritten).not.toContain(COMMAND_CANARY);
	});

	it('lists only provideSteps when the step has no host tools', async () => {
		startHelper({ FLOW_MCP_TOOLS: '', FLOW_MCP_TOOL_TOKEN: '' });
		const response = await rpc('tools/list', {});
		expect(response['result'].tools.map((tool: { name: string }) => tool.name)).toEqual(['provideSteps']);
	});

	it('forwards the exact v2 line and returns the reply text as content', async () => {
		startHelper();
		const response = await rpc('tools/call', { name: 'queue-task-show', arguments: { id: 'T1' } });
		expect(requests).toHaveLength(1);
		const line = requests[0] as Record<string, unknown>;
		expect(Object.keys(line)).toEqual(['v', 'kind', 'token', 'executionId', 'callId', 'toolId', 'args']);
		expect(line).toMatchObject({
			v: 2,
			kind: 'call_tool',
			token: TOOL_TOKEN,
			executionId: 'exec-1',
			toolId: 'queue-task-show',
			args: { id: 'T1' },
		});
		expect(typeof line['callId']).toBe('string');
		expect(response['result']).toEqual({ content: [{ type: 'text', text: 'task T1: open' }] });
	});

	it('still forwards provideSteps with the unchanged v1 line and the inject token', async () => {
		startHelper();
		behaviour = socket => socket.end();
		const steps = [{ id: 'a', type: 'script', script: 'echo' }];
		const response = await rpc('tools/call', { name: 'provideSteps', arguments: { steps } });
		expect(response['result'].isError).toBeUndefined();
		await expect.poll(() => rawLines.length).toBe(1);
		expect(rawLines[0]).toBe(JSON.stringify({ token: 'inject-token', executionId: 'exec-1', steps }));
	});

	it('marks an ok:false reply as an error and keeps the host text', async () => {
		startHelper();
		behaviour = (socket, line) => {
			socket.write(
				JSON.stringify({
					v: 2,
					callId: line['callId'],
					ok: false,
					text: 'Denied: id must match ^T',
					truncated: false,
					exitCode: null,
				}) + '\n'
			);
			socket.end();
		};
		const response = await rpc('tools/call', { name: 'queue-task-show', arguments: { id: 'x' } });
		expect(response['result']).toEqual({
			content: [{ type: 'text', text: 'Denied: id must match ^T' }],
			isError: true,
		});
	});

	it('reports a host too old for host tools when the host destroys the connection', async () => {
		startHelper();
		behaviour = socket => socket.destroy();
		const response = await rpc('tools/call', { name: 'queue-task-show', arguments: { id: 'T1' } });
		expect(response['result'].isError).toBe(true);
		expect(response['result'].content[0].text).toContain('host too old for host tools');
		expect(response['result'].content[0].text).toContain('Fix:');
	});

	it('gives up after the tool timeout plus the helper margin when the host stays silent', async () => {
		startHelper({
			FLOW_MCP_TOOLS: JSON.stringify([{ ...SHOW, timeoutSeconds: 0.05 }]),
			FLOW_MCP_HELPER_TIMEOUT_MARGIN_MS: '50',
		});
		behaviour = () => {};
		const response = await rpc('tools/call', { name: 'queue-task-show', arguments: { id: 'T1' } });
		expect(response['result'].isError).toBe(true);
		expect(response['result'].content[0].text).toContain('did not answer');
	});

	it.each([
		['not JSON', 'garbage\n', 'not valid JSON'],
		['not v2', JSON.stringify({ v: 1, ok: true, text: 't' }) + '\n', 'not protocol v2'],
		['another call', JSON.stringify({ v: 2, callId: 'other', ok: true, text: 't' }) + '\n', 'different call'],
		['an oversize line', 'x'.repeat(2 * 1024 * 1024 + 10), 'larger than the protocol allows'],
	])('refuses a reply that is %s', async (_name, raw, message) => {
		startHelper();
		behaviour = socket => {
			socket.write(raw);
		};
		const response = await rpc('tools/call', { name: 'queue-task-show', arguments: { id: 'T1' } });
		expect(response['result'].isError).toBe(true);
		expect(response['result'].content[0].text).toContain(message);
	});

	it('refuses arguments that are not an object without calling the host', async () => {
		startHelper();
		const response = await rpc('tools/call', { name: 'queue-task-show', arguments: ['T1'] });
		expect(response['result'].isError).toBe(true);
		expect(requests).toEqual([]);
	});

	it('names every available tool when the tool is unknown', async () => {
		startHelper();
		const response = await rpc('tools/call', { name: 'rm', arguments: {} });
		expect(response['error'].message).toContain('provideSteps, queue-task-show');
	});

	it.each([
		['malformed JSON', { FLOW_MCP_TOOLS: '{nope' }, 'not valid JSON'],
		['a non-array', { FLOW_MCP_TOOLS: '{}' }, 'array'],
		[
			'an entry without a timeout',
			{ FLOW_MCP_TOOLS: JSON.stringify([{ name: 'a', description: 'd', inputSchema: {} }]) },
			'timeoutSeconds',
		],
		['the reserved name', { FLOW_MCP_TOOLS: JSON.stringify([{ ...SHOW, name: 'provideSteps' }]) }, 'reserves'],
		['tools without a tool token', { FLOW_MCP_TOOL_TOKEN: '' }, 'FLOW_MCP_TOOL_TOKEN'],
	])('exits with an actionable message on %s', async (_name, env, message) => {
		const helper = startHelper(env);
		expect(await helper.exited).toBe(1);
		expect(helper.stderrText).toContain(message);
	});
});
