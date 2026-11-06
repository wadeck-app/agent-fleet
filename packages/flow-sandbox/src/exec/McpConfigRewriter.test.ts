import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import { McpConfigRewriter, VM_FORWARDER_PATH } from './McpConfigRewriter';

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const SERVER = 'C:\\repo\\packages\\flow-cli\\src\\worker\\mcp-server.cjs';

function engineConfig(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		mcpServers: {
			flow: {
				command: NODE,
				args: [SERVER],
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

describe('McpConfigRewriter', () => {
	const rewriter = new McpConfigRewriter(NODE);

	it('starts the forwarder in the VM, keeps token and execution id, and names the host callback port', () => {
		const result = rewriter.rewrite(engineConfig(), 'mcp-config-1.json');
		expect(result.callbackPort).toBe(54321);
		const parsed = JSON.parse(result.json);
		expect(parsed.mcpServers.flow).toEqual({
			command: 'node',
			args: [VM_FORWARDER_PATH],
			env: {
				FLOW_MCP_CALLBACK_TOKEN: 'tok',
				FLOW_EXECUTION_ID: 'exec-1',
				FLOW_MCP_UPSTREAM_HOST: 'host.docker.internal',
				FLOW_MCP_UPSTREAM_PORT: '54321',
			},
		});
		expect(result.json).not.toContain('C:\\');
	});

	it('accepts the host node written with another case or separators', () => {
		const text = engineConfig({ command: 'c:/program files/nodejs/NODE.EXE' });
		expect(rewriter.rewrite(text, 'x').callbackPort).toBe(54321);
	});

	it('refuses a config that is not JSON', () => {
		expect(refusal(() => rewriter.rewrite('{nope', 'bad.json'))).toMatch(/not valid JSON/);
	});

	it('refuses a config without mcpServers', () => {
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
		expect(refusal(() => rewriter.rewrite(engineConfig({ command: 'npx' }), 'x'))).toMatch(/not "<host node>/);
		expect(refusal(() => rewriter.rewrite(engineConfig({ args: ['C:\\evil\\server.js'] }), 'x'))).toMatch(
			/not "<host node>/
		);
		expect(refusal(() => rewriter.rewrite(engineConfig({ args: [SERVER, '--extra'] }), 'x'))).toMatch(
			/not "<host node>/
		);
		expect(refusal(() => rewriter.rewrite(engineConfig({ cwd: 'C:\\somewhere' }), 'x'))).toMatch(
			/not "<host node>/
		);
	});

	it('refuses a missing or invalid callback port', () => {
		expect(refusal(() => rewriter.rewrite(engineConfig({ env: {} }), 'x'))).toMatch(
			/no valid FLOW_MCP_CALLBACK_PORT/
		);
		expect(
			refusal(() => rewriter.rewrite(engineConfig({ env: { FLOW_MCP_CALLBACK_PORT: '70000' } }), 'x'))
		).toMatch(/no valid FLOW_MCP_CALLBACK_PORT/);
	});
});
