#!/usr/bin/env node

/**
 * Minimal stdio MCP server (newline-delimited JSON-RPC) used by the codex tests, both against the
 * real codex CLI and against codex-mock.mjs, so that the two see the same server.
 *
 * Tools:
 *   echo_tool { text }  -> "ECHO[<MCP_MARK env>]: <text>"
 *   info                -> JSON { argv, cwd, mark }  (what the server was started with)
 *   fail_tool           -> JSON-RPC error
 *   iserror_tool        -> result with isError: true
 */
import { createInterface } from 'node:readline';

function send(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n');
}

const TOOLS = [
	{
		name: 'echo_tool',
		description: 'Echoes the given text back, prefixed with the env var MCP_MARK.',
		inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
	},
	{
		name: 'info',
		description: 'Reports the arguments, working directory and MCP_MARK this server was started with.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'fail_tool',
		description: 'Always fails with a JSON-RPC error.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'iserror_tool',
		description: 'Always returns isError true.',
		inputSchema: { type: 'object', properties: {} },
	},
];

createInterface({ input: process.stdin }).on('line', line => {
	if (!line.trim()) return;
	const msg = JSON.parse(line);
	if (msg.id === undefined) return; // notification
	switch (msg.method) {
		case 'initialize':
			send({
				jsonrpc: '2.0',
				id: msg.id,
				result: {
					protocolVersion: msg.params.protocolVersion,
					capabilities: { tools: {} },
					serverInfo: { name: 'echo-server', version: '1.0.0' },
				},
			});
			break;
		case 'tools/list':
			send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
			break;
		case 'tools/call': {
			const { name, arguments: toolArguments } = msg.params;
			if (name === 'fail_tool') {
				send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'boom from fail_tool' } });
			} else if (name === 'iserror_tool') {
				send({
					jsonrpc: '2.0',
					id: msg.id,
					result: { isError: true, content: [{ type: 'text', text: 'iserror happened' }] },
				});
			} else if (name === 'info') {
				const info = { argv: process.argv.slice(2), cwd: process.cwd(), mark: process.env.MCP_MARK ?? null };
				send({
					jsonrpc: '2.0',
					id: msg.id,
					result: { content: [{ type: 'text', text: JSON.stringify(info) }] },
				});
			} else {
				send({
					jsonrpc: '2.0',
					id: msg.id,
					result: {
						content: [
							{ type: 'text', text: `ECHO[${process.env.MCP_MARK ?? 'nomark'}]: ${toolArguments.text}` },
						],
					},
				});
			}
			break;
		}
		default:
			send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } });
	}
});
