import { SandboxError } from '../SandboxError';
import { basenameBySyntax, flavorOf, sameHostPath } from './HostPaths';

/** Where the image keeps the MCP files (`image/Dockerfile`). */
export const VM_FORWARDER_PATH = '/opt/flow/mcp-callback-forwarder.cjs';
export const VM_HOST_ALIAS = 'host.docker.internal';

export interface RewrittenMcpConfig {
	json: string;
	/** The port of the engine's callback server on the HOST (the one the sandbox needs a network rule for). */
	callbackPort: number;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The MCP config file the engine writes for a model step (`{ mcpServers: { flow: { command, args, env } } }`) names the
 * HOST: `command` is the host node, `args` the host path of `mcp-server.cjs`, and the callback server listens on host
 * `127.0.0.1:<port>`. None of that exists in the VM.
 *
 * The rewritten config starts `node /opt/flow/mcp-callback-forwarder.cjs` instead: a small wrapper (image) that listens on
 * a VM-local loopback port, relays it to `host.docker.internal:<port>` and then loads the UNMODIFIED `mcp-server.cjs`
 * next to it (which still connects to 127.0.0.1). The tool surface is the one of the engine's own server; the token and
 * the execution id stay in the config's env (the model process can read them, exactly as a local model can today).
 *
 * Only the engine's own server is accepted. Any other MCP server, any other command or an unexpected shape is refused:
 * a server the host would have started cannot be started in the VM, and starting it silently somewhere else would
 * change what the step can do.
 */
export class McpConfigRewriter {
	/** @param platform the host the node path comes from (default: this one): decides whether two spellings of it are the same file. */
	constructor(
		private readonly hostNodePath: string,
		private readonly platform: NodeJS.Platform = process.platform
	) {}

	rewrite(text: string, source: string): RewrittenMcpConfig {
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch (error) {
			throw new SandboxError(
				'invalid-argument',
				`The MCP config ${source} is not valid JSON (${error instanceof Error ? error.message : String(error)}); it cannot be rewritten for the sandbox.`
			);
		}
		if (!isObject(parsed) || !isObject(parsed['mcpServers'])) {
			throw new SandboxError(
				'invalid-argument',
				`The MCP config ${source} has no "mcpServers" object; it cannot be rewritten for the sandbox.`
			);
		}
		const servers = parsed['mcpServers'];
		const names = Object.keys(servers);
		if (names.length !== 1 || names[0] !== 'flow') {
			throw new SandboxError(
				'invalid-argument',
				`The step uses MCP server(s) ${names.map(name => JSON.stringify(name)).join(', ')}. Only the engine's own "flow" server (provideSteps) can be reached from a sandbox in the exec variant; run this step on a worker without the "sandbox" label.`
			);
		}
		const entry = servers['flow'];
		if (!isObject(entry)) {
			throw new SandboxError('invalid-argument', `The "flow" MCP server in ${source} is not an object.`);
		}
		this.requireEngineServer(entry, source);
		const env = isObject(entry['env']) ? entry['env'] : {};
		const port = Number(env['FLOW_MCP_CALLBACK_PORT']);
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new SandboxError(
				'invalid-argument',
				`The "flow" MCP server in ${source} has no valid FLOW_MCP_CALLBACK_PORT (${JSON.stringify(env['FLOW_MCP_CALLBACK_PORT'])}).`
			);
		}
		const { FLOW_MCP_CALLBACK_PORT: _hostPort, ...rest } = env;
		const rewritten = {
			...parsed,
			mcpServers: {
				flow: {
					command: 'node',
					args: [VM_FORWARDER_PATH],
					env: { ...rest, FLOW_MCP_UPSTREAM_HOST: VM_HOST_ALIAS, FLOW_MCP_UPSTREAM_PORT: String(port) },
				},
			},
		};
		return { json: JSON.stringify(rewritten, null, 2), callbackPort: port };
	}

	private requireEngineServer(entry: JsonObject, source: string): void {
		const { command, args } = entry;
		const valid =
			typeof command === 'string' &&
			sameHostPath(command, this.hostNodePath, flavorOf(this.platform)) &&
			Array.isArray(args) &&
			args.length === 1 &&
			typeof args[0] === 'string' &&
			basenameBySyntax(args[0]) === 'mcp-server.cjs' &&
			entry['cwd'] === undefined;
		if (!valid) {
			throw new SandboxError(
				'invalid-argument',
				`The "flow" MCP server in ${source} is not "<host node> .../mcp-server.cjs" (command ${JSON.stringify(command)}, args ${JSON.stringify(args)}): the exec variant only knows how to relay the engine's own server.`
			);
		}
	}
}
