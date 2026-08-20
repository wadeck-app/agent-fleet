import * as net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InjectedStep } from '../ipc/Protocol';
import { McpServer } from './McpServer';

describe('McpServer (stdio transport)', () => {
	let server: McpServer;
	let injectedSteps: InjectedStep[][];

	beforeEach(() => {
		injectedSteps = [];
		const onInjectSteps = async (steps: InjectedStep[]) => {
			injectedSteps.push(steps);
		};
		server = new McpServer('test-exec', onInjectSteps);
	});

	afterEach(async () => {
		await server.stop().catch(() => {});
	});

	it('start() returns an mcpServer config with expected structure', async () => {
		const { mcpServer, port } = await server.start();
		// name must be 'flow'
		expect(mcpServer.name).toBe('flow');
		// command must be [node, mcp-server.cjs]
		expect(mcpServer.command).toHaveLength(2);
		expect(mcpServer.command[1]).toMatch(/mcp-server\.cjs$/);
		// env must carry the callback port matching the returned port
		expect(Number(mcpServer.env?.['FLOW_MCP_CALLBACK_PORT'])).toBe(port);
	});

	it('mcpServer uses stdio transport (command array, no url)', async () => {
		const { mcpServer } = await server.start();
		expect(Array.isArray(mcpServer.command)).toBe(true);
		expect(mcpServer.command.length).toBeGreaterThanOrEqual(1);
		expect(mcpServer.command[1]).toMatch(/mcp-server\.cjs$/);
		// No url property
		expect((mcpServer as unknown as Record<string, unknown>)['url']).toBeUndefined();
	});

	it('mcpServer has FLOW_MCP_CALLBACK_PORT and FLOW_EXECUTION_ID env vars', async () => {
		const { mcpServer } = await server.start();
		const env = mcpServer.env ?? {};
		expect(Number(env['FLOW_MCP_CALLBACK_PORT'])).toBeGreaterThan(0);
		expect(env['FLOW_EXECUTION_ID']).toBe('test-exec');
	});

	it('TCP callback server receives injected steps and calls onInjectSteps', async () => {
		const { mcpServer } = await server.start();
		const env = mcpServer.env ?? {};
		const callbackPort = Number(env['FLOW_MCP_CALLBACK_PORT']);
		const token = env['FLOW_MCP_CALLBACK_TOKEN'];

		const testSteps: InjectedStep[] = [{ id: 'hello', type: 'script', script: 'echo hi' } as InjectedStep];

		// Simulate mcp-server.cjs forwarding steps via TCP (with token + executionId)
		await new Promise<void>((resolve, reject) => {
			const socket = net.createConnection(callbackPort, '127.0.0.1', () => {
				const payload = JSON.stringify({ token, executionId: 'test-exec', steps: testSteps }) + '\n';
				socket.write(payload, () => {
					socket.end();
					resolve();
				});
			});
			socket.once('error', reject);
		});

		// Give a tick for the callback to fire
		await new Promise(r => setTimeout(r, 50));
		expect(injectedSteps).toHaveLength(1);
		expect(injectedSteps[0]).toEqual(testSteps);
	});

	it('mcpServer includes FLOW_MCP_CALLBACK_TOKEN env var', async () => {
		const { mcpServer } = await server.start();
		const token = mcpServer.env?.['FLOW_MCP_CALLBACK_TOKEN'];
		expect(typeof token).toBe('string');
		expect((token as string).length).toBeGreaterThan(16);
	});

	it('TCP callback: rejects connection with wrong token', async () => {
		const { mcpServer } = await server.start();
		const env = mcpServer.env ?? {};
		const callbackPort = Number(env['FLOW_MCP_CALLBACK_PORT']);
		const testSteps: InjectedStep[] = [{ id: 'bad', type: 'script', script: 'echo bad' } as InjectedStep];

		await new Promise<void>((resolve, reject) => {
			const socket = net.createConnection(callbackPort, '127.0.0.1', () => {
				const payload =
					JSON.stringify({ token: 'WRONG_TOKEN', executionId: 'test-exec', steps: testSteps }) + '\n';
				socket.write(payload, () => {
					socket.end();
					resolve();
				});
			});
			socket.once('error', reject);
		});

		await new Promise(r => setTimeout(r, 50));
		expect(injectedSteps).toHaveLength(0);
	});

	it('TCP callback: rejects connection with wrong executionId', async () => {
		const { mcpServer } = await server.start();
		const env = mcpServer.env ?? {};
		const callbackPort = Number(env['FLOW_MCP_CALLBACK_PORT']);
		const correctToken = env['FLOW_MCP_CALLBACK_TOKEN'];
		const testSteps: InjectedStep[] = [{ id: 'bad', type: 'script', script: 'echo bad' } as InjectedStep];

		await new Promise<void>((resolve, reject) => {
			const socket = net.createConnection(callbackPort, '127.0.0.1', () => {
				const payload =
					JSON.stringify({ token: correctToken, executionId: 'WRONG_EXEC_ID', steps: testSteps }) + '\n';
				socket.write(payload, () => {
					socket.end();
					resolve();
				});
			});
			socket.once('error', reject);
		});

		await new Promise(r => setTimeout(r, 50));
		expect(injectedSteps).toHaveLength(0);
	});

	it('TCP callback: processes multiple JSON lines in one data event', async () => {
		const { mcpServer } = await server.start();
		const env = mcpServer.env ?? {};
		const callbackPort = Number(env['FLOW_MCP_CALLBACK_PORT']);
		const token = env['FLOW_MCP_CALLBACK_TOKEN'];

		const steps1: InjectedStep[] = [{ id: 's1', type: 'script', script: 'echo 1' } as InjectedStep];
		const steps2: InjectedStep[] = [{ id: 's2', type: 'script', script: 'echo 2' } as InjectedStep];

		await new Promise<void>((resolve, reject) => {
			const socket = net.createConnection(callbackPort, '127.0.0.1', () => {
				// Send two JSON objects in one write (same TCP segment)
				const combined =
					JSON.stringify({ token, executionId: 'test-exec', steps: steps1 }) +
					'\n' +
					JSON.stringify({ token, executionId: 'test-exec', steps: steps2 }) +
					'\n';
				socket.write(combined, () => {
					socket.end();
					resolve();
				});
			});
			socket.once('error', reject);
		});

		await new Promise(r => setTimeout(r, 80));
		expect(injectedSteps).toHaveLength(2);
	});

	it('stop() closes the TCP server so no new connections are accepted', async () => {
		const { mcpServer } = await server.start();
		const env = mcpServer.env ?? {};
		const callbackPort = Number(env['FLOW_MCP_CALLBACK_PORT']);

		await server.stop();

		// Port should be closed now
		await expect(
			new Promise<void>((_, reject) => {
				const socket = net.createConnection(callbackPort, '127.0.0.1');
				socket.once('error', reject);
				socket.once('connect', () => {
					socket.end();
					reject(new Error('should not connect'));
				});
			})
		).rejects.toThrow();
	});
});
