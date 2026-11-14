import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';

/** One JSON-RPC message read from the server's stdout. */
export interface JsonRpcMessage {
	jsonrpc?: string;
	id?: number | string | null;
	// The shape of a result is what each test asserts on, so it is left untyped here.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	result?: any;
	error?: { code: number; message: string };
}

/**
 * A minimal MCP client for tests: spawns a stdio MCP server and speaks newline-delimited JSON-RPC to it, the way a model
 * CLI does. Every line the server wrote to stdout is kept in {@link stdoutLines} so a test can assert on what the server
 * said unprompted as well as on the replies.
 */
export class McpStdioTestClient {
	readonly stdoutLines: string[] = [];
	private stderr = '';
	private nextId = 1;
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly listeners = new Set<() => void>();
	/** Settles with the exit code when the server ends. */
	readonly exited: Promise<number | null>;

	/** @param command executable first, then its arguments (an `McpServerConfig.command`). */
	constructor(command: readonly string[], env: Readonly<Record<string, string | undefined>>) {
		const [executable, ...args] = command;
		if (executable === undefined) {
			throw new Error('McpStdioTestClient: the command is empty. Fix: pass the executable as the first element.');
		}
		this.child = spawn(executable, args, { env: { ...env } });
		this.exited = new Promise(resolve => this.child.once('exit', code => resolve(code)));
		let pending = '';
		this.child.stdout.on('data', chunk => {
			pending += chunk.toString('utf8');
			let newline: number;
			while ((newline = pending.indexOf('\n')) !== -1) {
				this.stdoutLines.push(pending.slice(0, newline));
				pending = pending.slice(newline + 1);
			}
			this.listeners.forEach(listener => listener());
		});
		this.child.stderr.on('data', chunk => (this.stderr += chunk.toString('utf8')));
	}

	get stderrText(): string {
		return this.stderr;
	}

	/** Everything the server wrote, stdout then stderr, for "this text appears nowhere" assertions. */
	get everythingWritten(): string {
		return `${this.stdoutLines.join('\n')}\n${this.stderr}`;
	}

	/** Sends a request and resolves with the response that carries its id. Rejects, naming the method, after `timeoutMs`. */
	request(method: string, params: unknown, timeoutMs = 10_000): Promise<JsonRpcMessage> {
		const id = this.nextId++;
		this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
		return new Promise((resolve, reject) => {
			const find = (): JsonRpcMessage | undefined =>
				this.stdoutLines.map(line => JSON.parse(line) as JsonRpcMessage).find(message => message.id === id);
			const timer = setTimeout(() => {
				this.listeners.delete(check);
				reject(
					new Error(
						`McpStdioTestClient: no response to '${method}' (id ${id}) within ${timeoutMs} ms. stderr: ${this.stderr || '(empty)'}`
					)
				);
			}, timeoutMs);
			const check = (): void => {
				const found = find();
				if (found === undefined) return;
				clearTimeout(timer);
				this.listeners.delete(check);
				resolve(found);
			};
			this.listeners.add(check);
			check();
		});
	}

	/** Sends a notification (no id: the server must not answer it). */
	notify(method: string, params?: unknown): void {
		this.child.stdin.write(
			JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }) + '\n'
		);
	}

	/** The `initialize` request and the `notifications/initialized` notification that follows it. */
	async initialize(): Promise<JsonRpcMessage> {
		const response = await this.request('initialize', {
			protocolVersion: '2024-11-05',
			capabilities: {},
			clientInfo: { name: 'mcp-stdio-test-client', version: '0' },
		});
		this.notify('notifications/initialized');
		return response;
	}

	kill(): void {
		this.child.kill();
	}
}
