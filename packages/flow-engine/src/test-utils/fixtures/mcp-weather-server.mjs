#!/usr/bin/env node
/**
 * Minimal MCP server fixture for integration tests.
 *
 * Wire format: NDJSON JSON-RPC 2.0 (StdioServerTransport).
 * Zero external dependencies — works with Node.js >=18.
 *
 * Tools:
 *   get_weather(city: string) → "Weather in <city>: sunny, 22°C"
 */
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, terminal: false });

function send(msg) {
	process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', (line) => {
	const trimmed = line.trim();
	if (!trimmed) return;

	let msg;
	try {
		msg = JSON.parse(trimmed);
	} catch {
		return;
	}

	const { id, method, params } = msg;

	if (method === 'initialize') {
		send({
			jsonrpc: '2.0',
			id,
			result: {
				protocolVersion: '2024-11-05',
				capabilities: { tools: {} },
				serverInfo: { name: 'weather-test', version: '1.0.0' },
			},
		});
	} else if (method === 'notifications/initialized') {
		// notification — no response
	} else if (method === 'tools/list') {
		send({
			jsonrpc: '2.0',
			id,
			result: {
				tools: [
					{
						name: 'get_weather',
						description: 'Get current weather for a city.',
						inputSchema: {
							type: 'object',
							properties: { city: { type: 'string', description: 'Name of the city' } },
							required: ['city'],
						},
					},
				],
			},
		});
	} else if (method === 'tools/call') {
		const toolName = params?.name;
		const toolInput = params?.arguments ?? {};

		if (toolName === 'get_weather') {
			const city = String(toolInput['city'] ?? 'unknown');
			send({
				jsonrpc: '2.0',
				id,
				result: {
					content: [{ type: 'text', text: `Weather in ${city}: sunny, 22°C` }],
					isError: false,
				},
			});
		} else {
			send({
				jsonrpc: '2.0',
				id,
				error: { code: -32601, message: `Unknown tool: ${String(toolName)}` },
			});
		}
	} else if (id !== undefined) {
		send({
			jsonrpc: '2.0',
			id,
			error: { code: -32601, message: `Method not found: ${method}` },
		});
	}
});

rl.on('close', () => process.exit(0));
