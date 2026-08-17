import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

	it('start() returns a config path that exists', async () => {
		const { configPath } = await server.start();
		expect(fs.existsSync(configPath)).toBe(true);
		await server.stop();
		expect(fs.existsSync(configPath)).toBe(false);
	});

	it('config file uses stdio transport (command + args)', async () => {
		const { configPath } = await server.start();
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers: { flow: { command: string; args: string[]; env: Record<string, string> } };
		};
		const flowServer = config.mcpServers.flow;
		// Must use stdio transport (command/args), NOT HTTP (url)
		expect(flowServer.command).toBeTruthy();
		expect(Array.isArray(flowServer.args)).toBe(true);
		expect(flowServer.args[0]).toMatch(/mcp-server\.cjs$/);
		expect((config.mcpServers.flow as any).url).toBeUndefined();
	});

	it('config file has FLOW_MCP_CALLBACK_PORT and FLOW_EXECUTION_ID env vars', async () => {
		const { configPath } = await server.start();
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers: { flow: { env: Record<string, string> } };
		};
		const env = config.mcpServers.flow.env;
		expect(Number(env.FLOW_MCP_CALLBACK_PORT)).toBeGreaterThan(0);
		expect(env.FLOW_EXECUTION_ID).toBe('test-exec');
	});

	it('TCP callback server receives injected steps and calls onInjectSteps', async () => {
		const { configPath } = await server.start();
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers: { flow: { env: Record<string, string> } };
		};
		const callbackPort = Number(config.mcpServers.flow.env.FLOW_MCP_CALLBACK_PORT);
		const token = config.mcpServers.flow.env.FLOW_MCP_CALLBACK_TOKEN;

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

	it('config file includes FLOW_MCP_CALLBACK_TOKEN env var', async () => {
		const { configPath } = await server.start();
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers: { flow: { env: Record<string, string> } };
		};
		const token = config.mcpServers.flow.env.FLOW_MCP_CALLBACK_TOKEN;
		expect(typeof token).toBe('string');
		expect(token.length).toBeGreaterThan(16);
	});

	it('TCP callback: rejects connection with wrong token', async () => {
		const { configPath } = await server.start();
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers: { flow: { env: Record<string, string> } };
		};
		const callbackPort = Number(config.mcpServers.flow.env.FLOW_MCP_CALLBACK_PORT);
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
		const { configPath } = await server.start();
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers: { flow: { env: Record<string, string> } };
		};
		const callbackPort = Number(config.mcpServers.flow.env.FLOW_MCP_CALLBACK_PORT);
		const correctToken = config.mcpServers.flow.env.FLOW_MCP_CALLBACK_TOKEN;
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
		const { configPath } = await server.start();
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers: { flow: { env: Record<string, string> } };
		};
		const callbackPort = Number(config.mcpServers.flow.env.FLOW_MCP_CALLBACK_PORT);
		const token = config.mcpServers.flow.env.FLOW_MCP_CALLBACK_TOKEN;

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
		const { configPath } = await server.start();
		const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
			mcpServers: { flow: { env: Record<string, string> } };
		};
		const callbackPort = Number(config.mcpServers.flow.env.FLOW_MCP_CALLBACK_PORT);

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
