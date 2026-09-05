import * as crypto from 'node:crypto';
import * as net from 'node:net';
import { fileURLToPath } from 'node:url';

import type { InjectedStep } from '../ipc/Protocol';

export interface McpServerConfig {
	name: string;
	command: string[];
	env?: Record<string, string>;
}

/** Path to the CJS stdio MCP server script, resolved relative to this module. */
const MCP_SERVER_CJS = fileURLToPath(new URL('./mcp-server.cjs', import.meta.url));

/**
 * McpServer -- exposes the `provideSteps` tool to Claude via a stdio-based MCP server.
 *
 * Architecture:
 *  1. This class starts a TCP callback server (on a random port, bound to 127.0.0.1).
 *  2. start() returns an McpServer config (name/command/env) -- the caller passes it to
 *     StepRunner as mcpServers[]; the model provider (ClaudeModelProvider) serializes it
 *     to a temp file and passes --mcp-config to the CLI.
 *  3. The CLI spawns `mcp-server.cjs` via stdio, which connects back via TCP.
 *  4. When the CLI calls `provideSteps`, `mcp-server.cjs` opens a TCP connection to
 *     the callback server and sends { token, executionId, steps } as JSON.
 *  5. The callback server validates token + executionId before calling `onInjectSteps`.
 *
 * Security properties:
 *  - TCP server bound to 127.0.0.1 only
 *  - Random callback token prevents other local processes from injecting steps
 *  - executionId verification prevents cross-execution injection
 *  - Token shared only via env var to the MCP subprocess (not on any network)
 */
export class McpServer {
	private tcpServer: net.Server | null = null;
	private callbackToken = '';

	constructor(
		private readonly executionId: string,
		private readonly onInjectSteps: (steps: InjectedStep[]) => Promise<void>
	) {}

	/**
	 * Start the TCP callback server.
	 * Returns the port and the McpServerConfig to pass to StepRunner as mcpServers.
	 */
	async start(): Promise<{ port: number; mcpServer: McpServerConfig }> {
		this.callbackToken = crypto.randomUUID().replace(/-/g, '');
		const callbackPort = await this.startTcpServer();
		const mcpServer = this.buildMcpServerConfig(callbackPort);
		return { port: callbackPort, mcpServer };
	}

	async stop(): Promise<void> {
		if (!this.tcpServer) return;
		return new Promise((resolve, reject) => {
			const server = this.tcpServer!;
			this.tcpServer = null;
			server.close(err => {
				err ? reject(err) : resolve();
			});
		});
	}

	/** Start a TCP server that receives step payloads from mcp-server.cjs. */
	private startTcpServer(): Promise<number> {
		return new Promise((resolve, reject) => {
			const server = net.createServer(socket => {
				let buf = '';
				socket.on('data', chunk => {
					buf += chunk.toString('utf8');
					// Fix 4: process ALL newline-delimited JSON objects in the buffer
					let nl: number;
					while ((nl = buf.indexOf('\n')) !== -1) {
						const line = buf.slice(0, nl);
						buf = buf.slice(nl + 1);
						if (!line.trim()) continue;
						let payload: { token: string; executionId: string; steps: InjectedStep[] };
						try {
							payload = JSON.parse(line) as typeof payload;
						} catch {
							process.stderr.write('[McpServer] TCP: invalid JSON payload\n');
							continue;
						}
						// Fix 2: verify auth token
						if (payload.token !== this.callbackToken) {
							process.stderr.write('[McpServer] TCP: rejected -- invalid token\n');
							socket.destroy();
							return;
						}
						// Fix 1: verify executionId
						if (payload.executionId !== this.executionId) {
							process.stderr.write(
								`[McpServer] TCP: rejected -- executionId mismatch (got ${payload.executionId}, expected ${this.executionId})\n`
							);
							socket.destroy();
							return;
						}
						this.onInjectSteps(payload.steps).catch(err => {
							process.stderr.write(`[McpServer] onInjectSteps error: ${String(err)}\n`);
						});
					}
				});
				socket.on('error', err => {
					process.stderr.write(`[McpServer] TCP socket error: ${(err instanceof Error ? err.message : String(err))}\n`);
				});
			});
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				const addr = server.address();
				if (!addr || typeof addr === 'string') {
					reject(new Error('Failed to get TCP server port'));
					return;
				}
				this.tcpServer = server;
				resolve(addr.port);
			});
		});
	}

	private buildMcpServerConfig(callbackPort: number): McpServerConfig {
		return {
			name: 'flow',
			command: [process.execPath, MCP_SERVER_CJS],
			env: {
				FLOW_MCP_CALLBACK_PORT: String(callbackPort),
				FLOW_MCP_CALLBACK_TOKEN: this.callbackToken,
				FLOW_EXECUTION_ID: this.executionId,
			},
		};
	}
}
