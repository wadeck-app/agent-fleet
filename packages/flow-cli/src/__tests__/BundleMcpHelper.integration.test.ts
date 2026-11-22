/**
 * Does the PUBLISHED layout contain the MCP helper the worker launches?
 *
 * McpServer.ts resolves `mcp-server.cjs` next to the running worker. In the bundle that is next to worker.cjs, and the
 * bundler never saw the file (plain CommonJS, not imported), so it was missing from every published CLI: codex, which
 * declares the "flow" MCP server as required, failed every step with "handshaking with MCP server failed". No other
 * test notices, they all run from src/ where the file sits next to McpServer.ts.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { createIsolatedCliEnv } from '../test-utils/IsolatedCliEnv';

const agentFleetRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const distBundle = resolve(agentFleetRoot, 'packages/flow-cli/dist-bundle');

describe('bundle layout: the MCP helper of the worker', () => {
	it('is built next to worker.cjs, where the bundled worker resolves it', () => {
		expect(existsSync(resolve(distBundle, 'worker.cjs'))).toBe(true);
		expect(existsSync(resolve(distBundle, 'mcp-server.cjs'))).toBe(true);
	});

	it('answers the MCP initialize handshake from the bundle directory', async () => {
		// Isolated env like every test that spawns a bundle (IsolatedCliEnvUsage.test.ts enforces it).
		const isolation = createIsolatedCliEnv({
			extra: { FLOW_MCP_CALLBACK_PORT: '1', FLOW_MCP_CALLBACK_TOKEN: 'test' },
		});
		const child = spawn(process.execPath, [resolve(distBundle, 'mcp-server.cjs')], {
			env: isolation.env,
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		});
		try {
			const answer = await new Promise<string>((resolveAnswer, reject) => {
				// No timer: the test timeout of vitest ends a helper that never answers.
				child.once('error', reject);
				child.once('exit', code =>
					reject(new Error(`the bundled MCP helper exited (code ${String(code)}) before answering`))
				);
				child.stdout.once('data', (chunk: Buffer) => {
					resolveAnswer(chunk.toString('utf8'));
				});
				child.stdin.write(
					JSON.stringify({
						jsonrpc: '2.0',
						id: 1,
						method: 'initialize',
						params: { protocolVersion: '2024-11-05' },
					}) + '\n'
				);
			});
			expect(JSON.parse(answer.split('\n')[0]!)).toMatchObject({
				id: 1,
				result: { serverInfo: { name: 'flow-mcp' } },
			});
		} finally {
			child.kill();
			isolation.cleanup();
		}
	});

	it('is copied into the published package: packaging script and workflow both name it', () => {
		expect(readFileSync(resolve(agentFleetRoot, 'ci/scripts/copy-binaries.sh'), 'utf8')).toContain(
			'mcp-server.cjs'
		);
		expect(readFileSync(resolve(agentFleetRoot, '.github/workflows/publish-flow-cli.yml'), 'utf8')).toContain(
			'flow:worker.cjs:mcp-server.cjs:'
		);
	});
});
