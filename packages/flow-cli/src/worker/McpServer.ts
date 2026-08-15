import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import type { InjectedStep } from '../ipc/Protocol';

const PROVIDE_STEPS_TOOL = {
	name: 'provideSteps',
	description: 'Inject steps into the running flow execution graph',
	inputSchema: {
		type: 'object',
		properties: {
			steps: {
				type: 'array',
				items: {
					type: 'object',
					required: ['id', 'type'],
					properties: {
						id: { type: 'string' },
						type: { enum: ['model', 'script', 'subflow'] },
						parent: { type: 'string' },
						depends: { type: 'array', items: { type: 'string' } },
					},
					additionalProperties: true,
				},
			},
		},
		required: ['steps'],
	},
};

interface JsonRpcRequest {
	jsonrpc: '2.0';
	method: string;
	params?: unknown;
	id?: number | string | null;
}

interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: number | string | null;
	result?: unknown;
	error?: { code: number; message: string };
}

// Allowed fields for injected steps — unknown fields are rejected to prevent injection of
// unsupported or dangerous keys.
const ALLOWED_STEP_FIELDS = new Set([
	'id',
	'type',
	'name',
	'parent',
	'depends',
	'prompt',
	'model',
	'script',
	'workingDir',
	'env',
	'captureOutput',
	'inputs',
	'flowId',
	'workspaceStrategy',
	'allowRecursion',
	'output',
	'when',
	'context',
	'retry',
	'onFailure',
	'contract',
	'skipOnLoop',
]);

export class McpServer {
	private server: http.Server | null = null;
	private configPath: string | null = null;
	// Bearer token generated at start() — embedded in the MCP config URL so Claude can authenticate.
	private token: string = '';

	constructor(
		private readonly executionId: string,
		private readonly onInjectSteps: (steps: InjectedStep[]) => Promise<void>
	) {}

	async start(): Promise<{ port: number; configPath: string }> {
		this.token = crypto.randomUUID().replace(/-/g, '');
		return new Promise((resolve, reject) => {
			this.server = http.createServer((req, res) => {
				this.handleRequest(req, res).catch(err => {
					res.writeHead(500, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: String(err) }));
				});
			});

			this.server.on('error', reject);

			this.server.listen(0, '127.0.0.1', () => {
				const address = this.server!.address();
				if (!address || typeof address === 'string') {
					reject(new Error('Failed to get server port'));
					return;
				}
				const port = address.port;
				const configPath = this.writeConfig(port);
				this.configPath = configPath;
				resolve({ port, configPath });
			});
		});
	}

	async stop(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.configPath) {
				try {
					fs.unlinkSync(this.configPath);
				} catch {
					// Ignore cleanup errors
				}
				this.configPath = null;
			}
			if (!this.server) {
				resolve();
				return;
			}
			const server = this.server;
			this.server = null; // null immediately so concurrent stop() calls don't double-close
			server.close(err => {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	private writeConfig(port: number): string {
		const config = {
			mcpServers: {
				flow: {
					url: `http://127.0.0.1:${port}/mcp`,
					headers: { Authorization: `Bearer ${this.token}` },
				},
			},
		};
		const configPath = path.join(os.tmpdir(), `flow-mcp-${this.executionId}-${Date.now()}.json`);
		// mode 0o600: owner read/write only — MCP config contains a loopback URL but may
		// be extended with auth tokens in future versions.
		fs.writeFileSync(configPath, JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
		return configPath;
	}

	private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const url = new URL(req.url ?? '/', `http://127.0.0.1`);
		if (url.pathname !== '/mcp' || req.method !== 'POST') {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
			return;
		}
		const authHeader = req.headers['authorization'];
		if (!authHeader || authHeader !== `Bearer ${this.token}`) {
			res.writeHead(401, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Unauthorized' }));
			return;
		}

		const body = await this.readBody(req);
		let parsed: JsonRpcRequest;
		try {
			parsed = JSON.parse(body) as JsonRpcRequest;
		} catch {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
			return;
		}

		const response = await this.handleJsonRpc(parsed);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(response));
	}

	private async handleJsonRpc(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
		const id = request.id ?? null;

		switch (request.method) {
			case 'initialize':
				return {
					jsonrpc: '2.0',
					id,
					result: {
						protocolVersion: '2024-11-05',
						capabilities: { tools: {} },
						serverInfo: { name: 'flow-mcp', version: '1.0.0' },
					},
				};
			case 'initialized':
				// Notification — no response
				return null;
			case 'tools/list':
				return {
					jsonrpc: '2.0',
					id,
					result: { tools: [PROVIDE_STEPS_TOOL] },
				};
			case 'tools/call':
				return await this.handleToolCall(id, request.params);
			default:
				return {
					jsonrpc: '2.0',
					id,
					error: { code: -32601, message: `Method not found: ${request.method}` },
				};
		}
	}

	private async handleToolCall(id: number | string | null, params: unknown): Promise<JsonRpcResponse> {
		const callParams = params as { name?: string; arguments?: unknown };
		if (callParams?.name !== 'provideSteps') {
			return {
				jsonrpc: '2.0',
				id,
				error: { code: -32601, message: `Unknown tool: ${callParams?.name}` },
			};
		}

		const args = callParams.arguments as { steps?: unknown };
		if (!args || !Array.isArray(args.steps)) {
			return {
				jsonrpc: '2.0',
				id,
				error: { code: -32602, message: 'Invalid arguments: steps must be an array' },
			};
		}

		const steps = args.steps as InjectedStep[];

		// Validate each step
		for (const step of steps) {
			const unknownFields = Object.keys(step as object).filter(k => !ALLOWED_STEP_FIELDS.has(k));
			if (unknownFields.length > 0) {
				return {
					jsonrpc: '2.0',
					id,
					error: {
						code: -32602,
						message: `Step '${String((step as { id?: unknown }).id)}' has unknown fields: ${unknownFields.join(', ')}`,
					},
				};
			}
			if ((step as { type: string }).type === 'user_intervention') {
				return {
					jsonrpc: '2.0',
					id,
					error: { code: -32603, message: `Step type 'user_intervention' is not supported` },
				};
			}
			if (!step.id || typeof step.id !== 'string') {
				return {
					jsonrpc: '2.0',
					id,
					error: { code: -32603, message: `Step must have a valid id` },
				};
			}
			if (!step.type || !['model', 'script', 'subflow'].includes(step.type as string)) {
				return {
					jsonrpc: '2.0',
					id,
					error: { code: -32603, message: `Step '${step.id}' has invalid type: ${String(step.type)}` },
				};
			}
		}

		try {
			await this.onInjectSteps(steps);
			const injectedIds = steps.map(s => s.id);
			return {
				jsonrpc: '2.0',
				id,
				result: {
					content: [
						{
							type: 'text',
							text: JSON.stringify({ injected: injectedIds }),
						},
					],
				},
			};
		} catch (err) {
			return {
				jsonrpc: '2.0',
				id,
				error: { code: -32603, message: String(err) },
			};
		}
	}

	private readBody(req: http.IncomingMessage): Promise<string> {
		const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB — protects against unbounded memory growth
		return new Promise((resolve, reject) => {
			let body = '';
			let totalBytes = 0;
			req.on('data', chunk => {
				const str = (chunk as Buffer).toString('utf8');
				totalBytes += Buffer.byteLength(str);
				if (totalBytes > MAX_BODY_BYTES) {
					req.destroy();
					reject(new Error('Request body too large'));
					return;
				}
				body += str;
			});
			req.on('end', () => resolve(body));
			req.on('error', reject);
		});
	}
}
