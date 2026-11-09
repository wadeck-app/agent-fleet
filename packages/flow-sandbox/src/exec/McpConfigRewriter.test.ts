import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import { McpConfigRewriter, VM_FORWARDER_PATH } from './McpConfigRewriter';

/** The host's node and the engine's MCP server, written the way each kind of host writes them. Every case runs for both. */
interface Flavor {
	name: string;
	platform: NodeJS.Platform;
	node: string;
	server: string;
	/** A path that is not the engine's server, in the same syntax. */
	evilServer: string;
	/** A directory in the same syntax, for the unexpected `cwd`. */
	somewhere: string;
	/** Text that must not survive in the rewritten config (a host path). */
	hostFragment: string;
}

const FLAVORS: Flavor[] = [
	{
		name: 'Windows host',
		platform: 'win32',
		node: 'C:\\Program Files\\nodejs\\node.exe',
		server: 'C:\\repo\\packages\\flow-cli\\src\\worker\\mcp-server.cjs',
		evilServer: 'C:\\evil\\server.js',
		somewhere: 'C:\\somewhere',
		hostFragment: 'C:\\',
	},
	{
		name: 'POSIX host',
		platform: 'linux',
		node: '/usr/local/bin/node',
		server: '/repo/packages/flow-cli/src/worker/mcp-server.cjs',
		evilServer: '/evil/server.js',
		somewhere: '/somewhere',
		hostFragment: '/repo/',
	},
];

function engineConfig(flavor: Flavor, overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		mcpServers: {
			flow: {
				command: flavor.node,
				args: [flavor.server],
				env: { FLOW_MCP_CALLBACK_PORT: '54321', FLOW_MCP_CALLBACK_TOKEN: 'tok', FLOW_EXECUTION_ID: 'exec-1' },
				...overrides,
			},
		},
	});
}

function refusal(action: () => unknown): string {
	try {
		action();
	} catch (error) {
		expect(error).toBeInstanceOf(SandboxError);
		return (error as SandboxError).message;
	}
	throw new Error('expected a refusal');
}

describe.each(FLAVORS)('McpConfigRewriter on a $name', flavor => {
	const rewriter = new McpConfigRewriter(flavor.node, flavor.platform);
	const config = (overrides: Record<string, unknown> = {}): string => engineConfig(flavor, overrides);

	it('starts the forwarder in the VM, keeps token and execution id, and names the host callback port', () => {
		const result = rewriter.rewrite(config(), 'mcp-config-1.json');

		expect(result.callbackPort).toBe(54321);
		expect(JSON.parse(result.json).mcpServers.flow).toEqual({
			command: 'node',
			args: [VM_FORWARDER_PATH],
			env: {
				FLOW_MCP_CALLBACK_TOKEN: 'tok',
				FLOW_EXECUTION_ID: 'exec-1',
				FLOW_MCP_UPSTREAM_HOST: 'host.docker.internal',
				FLOW_MCP_UPSTREAM_PORT: '54321',
			},
		});
		expect(result.json).not.toContain(flavor.hostFragment);
	});

	it('refuses a config that is not JSON, or has no mcpServers', () => {
		expect(refusal(() => rewriter.rewrite('{nope', 'bad.json'))).toMatch(/not valid JSON/);
		expect(refusal(() => rewriter.rewrite('{}', 'x'))).toMatch(/no "mcpServers" object/);
	});

	it('refuses any server but the engine\'s own "flow", naming the others', () => {
		const text = JSON.stringify({ mcpServers: { flow: {}, github: { command: 'npx' } } });
		expect(refusal(() => rewriter.rewrite(text, 'x'))).toMatch(
			/"flow", "github".*worker without the "sandbox" label/
		);
		expect(refusal(() => rewriter.rewrite(JSON.stringify({ mcpServers: { other: {} } }), 'x'))).toMatch(/"other"/);
	});

	it('refuses a "flow" server that is not host node + mcp-server.cjs', () => {
		for (const overrides of [
			{ command: 'npx' },
			{ args: [flavor.evilServer] },
			{ args: [flavor.server, '--extra'] },
			{ cwd: flavor.somewhere },
		]) {
			expect(refusal(() => rewriter.rewrite(config(overrides), 'x'))).toMatch(/not "<host node>/);
		}
	});

	it('refuses a missing or invalid callback port', () => {
		expect(refusal(() => rewriter.rewrite(config({ env: {} }), 'x'))).toMatch(/no valid FLOW_MCP_CALLBACK_PORT/);
		expect(refusal(() => rewriter.rewrite(config({ env: { FLOW_MCP_CALLBACK_PORT: '70000' } }), 'x'))).toMatch(
			/no valid FLOW_MCP_CALLBACK_PORT/
		);
	});
});

describe('McpConfigRewriter: which spellings of the host node are the same file', () => {
	// Windows is case-insensitive and takes both separators; a POSIX host is exact. The same text is accepted on one and refused on the other.
	it('accepts the host node written with another case or separators on a Windows host', () => {
		const windows = FLAVORS[0] as Flavor;
		const text = engineConfig(windows, { command: 'c:/program files/nodejs/NODE.EXE' });

		expect(new McpConfigRewriter(windows.node, 'win32').rewrite(text, 'x').callbackPort).toBe(54321);
	});

	it('refuses the host node written with another case on a POSIX host (two files there)', () => {
		const posix = FLAVORS[1] as Flavor;
		const text = engineConfig(posix, { command: '/USR/local/bin/NODE' });

		expect(refusal(() => new McpConfigRewriter(posix.node, 'linux').rewrite(text, 'x'))).toMatch(
			/not "<host node>/
		);
	});

	it('reads the server name by the syntax of the path string, whichever host runs the check', () => {
		// A Windows path read on a POSIX host (a config written elsewhere) is still `mcp-server.cjs`.
		const windows = FLAVORS[0] as Flavor;
		const text = engineConfig(windows);

		expect(new McpConfigRewriter(windows.node, 'linux').rewrite(text, 'x').callbackPort).toBe(54321);
	});
});
