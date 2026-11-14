import { HostToolModelView, HostToolSchemaLimits } from 'flow-engine';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import { fileURLToPath } from 'node:url';

import type { InjectedStep } from '../ipc/Protocol';
import type { HostToolServing, McpCallToolConfig } from './HostToolCallTypes';
import { DEFAULT_CALL_GRACE_MS } from './HostToolCallTypes';
import { HostToolLimits } from './HostToolLimits';
import { DEFAULT_CALLBACK_IDLE_TIMEOUT_MS, McpCallbackConnection } from './McpCallbackConnection';

export interface McpServerConfig {
	name: string;
	command: string[];
	env?: Record<string, string>;
}

/** Concurrent callback connections accepted; the legitimate helper opens one at a time. */
const DEFAULT_MAX_CALLBACK_CONNECTIONS = 8;

export interface McpServerOptions {
	/** Overrides the idle timeout of a callback connection (tests use a short one). */
	idleTimeoutMs?: number;
	/** Overrides the concurrent connection cap. */
	maxConnections?: number;
	/** The host tools of the step. Without tools (absent or empty) no `call_tool` bearer is issued at all. */
	hostTools?: HostToolServing;
	/** Overrides the grace added to a tool's `timeoutSeconds` for the per-call timer (tests use a short one). */
	callGraceMs?: number;
}

/** The host tools of a step do not fit what may be handed to the MCP helper; the step cannot start. */
export class HostToolSetTooLargeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'HostToolSetTooLargeError';
	}
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
	/** Issued only when the step declares tools. */
	private toolToken: string | null = null;
	private stopped = false;

	constructor(
		private readonly executionId: string,
		private readonly onInjectSteps: (steps: InjectedStep[]) => Promise<void>,
		private readonly options: McpServerOptions = {}
	) {}

	/**
	 * Start the TCP callback server.
	 * Returns the port and the McpServerConfig to pass to StepRunner as mcpServers.
	 */
	async start(): Promise<{ port: number; mcpServer: McpServerConfig }> {
		this.assertToolsFit();
		this.callbackToken = McpServer.newToken();
		this.toolToken = this.declaredTools().length > 0 ? McpServer.newToken() : null;
		const callbackPort = await this.startTcpServer();
		const mcpServer = this.buildMcpServerConfig(callbackPort);
		return { port: callbackPort, mcpServer };
	}

	async stop(): Promise<void> {
		// Both bearers die here, even for a connection that is still open.
		this.stopped = true;
		if (!this.tcpServer) return;
		return new Promise((resolve, reject) => {
			const server = this.tcpServer!;
			this.tcpServer = null;
			server.close(err => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	/** Start a TCP server that receives step payloads from mcp-server.cjs. */
	private startTcpServer(): Promise<number> {
		const callTool = this.callToolConfig();
		return new Promise((resolve, reject) => {
			const server = net.createServer(socket => {
				new McpCallbackConnection(socket, {
					token: this.callbackToken,
					executionId: this.executionId,
					onInjectSteps: this.onInjectSteps,
					isRevoked: () => this.stopped,
					...(callTool === null ? {} : { callTool }),
					idleTimeoutMs: this.options.idleTimeoutMs ?? DEFAULT_CALLBACK_IDLE_TIMEOUT_MS,
					log: message => process.stderr.write(`[McpServer] ${message}\n`),
				});
			});
			// Beyond the limit Node drops the incoming connection: the peer sees it closed.
			server.maxConnections = this.options.maxConnections ?? DEFAULT_MAX_CALLBACK_CONNECTIONS;
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
				...this.hostToolEnv(),
			},
		};
	}

	private static newToken(): string {
		return crypto.randomUUID().replace(/-/g, '');
	}

	private declaredTools(): HostToolServing['tools'] {
		return this.options.hostTools?.tools ?? [];
	}

	/** The one mechanism by which the helper learns the tools: what the model sees plus each timeout, never the command. */
	private hostToolEnv(): Record<string, string> {
		const tools = this.declaredTools();
		if (tools.length === 0 || this.toolToken === null) return {};
		const entries = tools.map(tool => ({
			...HostToolModelView.describe(tool),
			timeoutSeconds: HostToolLimits.resolve(tool).timeoutSeconds,
		}));
		return { FLOW_MCP_TOOLS: JSON.stringify(entries), FLOW_MCP_TOOL_TOKEN: this.toolToken };
	}

	private callToolConfig(): McpCallToolConfig | null {
		const serving = this.options.hostTools;
		if (serving === undefined || this.toolToken === null) return null;
		return {
			toolToken: this.toolToken,
			declared: serving.tools.map(tool => {
				const limits = HostToolLimits.resolve(tool);
				return { id: tool.id, timeoutSeconds: limits.timeoutSeconds, maxOutputBytes: limits.maxOutputBytes };
			}),
			handler: serving.handler,
			graceMs: this.options.callGraceMs ?? DEFAULT_CALL_GRACE_MS,
		};
	}

	/** No fallback: a set the helper cannot be given makes the step fail at run start. */
	private assertToolsFit(): void {
		const serving = this.options.hostTools;
		if (serving === undefined || serving.tools.length === 0) return;
		const label = `Step '${serving.stepId}'`;
		if (serving.tools.length > HostToolSchemaLimits.MAX_TOOLS_PER_STEP) {
			throw new HostToolSetTooLargeError(
				`${label}: ${serving.tools.length} tools declared, the limit is ${HostToolSchemaLimits.MAX_TOOLS_PER_STEP}. Fix: declare fewer host tools.`
			);
		}
		const bytes = HostToolModelView.byteLength(serving.tools);
		if (bytes > HostToolSchemaLimits.MAX_DESCRIPTION_SET_BYTES) {
			throw new HostToolSetTooLargeError(
				`${label}: host tools description is ${bytes} bytes, the limit is ${HostToolSchemaLimits.MAX_DESCRIPTION_SET_BYTES}. Fix: shorten descriptions or declare fewer tools.`
			);
		}
	}
}
