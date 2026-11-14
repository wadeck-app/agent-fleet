import type { HostTool } from 'flow-engine';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { HostToolFixtureDirectory } from '../test-utils/HostToolFixtureDirectory';
import { waitUntil } from '../test-utils/WaitHelpers';
import { HostToolStepWiring } from './HostToolStepWiring';
import { McpServer } from './McpServer';

const ANY_TEXT = '^[\\s\\S]*$';
const EXECUTION_ID = 'exec-abort';

const isAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

/**
 * The real McpServer, wiring, call service and executor, a real fixture tool that sleeps 30 s and starts a detached
 * grandchild, and a raw loopback client playing the helper. What is proven: ending the step or losing the connection
 * ends the tool's whole process tree at once, instead of leaving it to run to its timeout.
 */
describe('McpServer aborts the in-flight host tool call', () => {
	let fixtures: HostToolFixtureDirectory;
	let workspace: string;
	let server: McpServer | undefined;
	const sockets: net.Socket[] = [];

	beforeAll(() => {
		fixtures = HostToolFixtureDirectory.create();
		workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-abort-'));
	});
	afterAll(() => {
		fixtures.remove();
		fs.rmSync(workspace, { recursive: true, force: true });
	});
	afterEach(async () => {
		for (const socket of sockets.splice(0)) socket.destroy();
		await server?.stop().catch(() => {});
		server = undefined;
	});

	const sleeper = (): HostTool =>
		fixtures.tool('sleep.cjs', ['{beat}', '{pids}'], {
			id: 'sleeper',
			description: 'Sleeps for the whole test (test).',
			args: {
				beat: { type: 'string', pattern: ANY_TEXT, required: true },
				pids: { type: 'string', pattern: ANY_TEXT, required: true },
			},
			timeoutSeconds: 60,
		});

	interface Started {
		port: number;
		toolToken: string;
		auditLines: string[];
	}

	const startServer = async (): Promise<Started> => {
		const auditLines: string[] = [];
		const serving = HostToolStepWiring.prepare({
			stepId: 'triage',
			hostTools: [sleeper(), fixtures.tool('flood.cjs', ['10'], { id: 'quick', description: 'Quick (test).' })],
			workspaceDir: workspace,
			workerEnvironment: process.env,
			writeAuditLine: line => auditLines.push(line),
		})!;
		server = new McpServer(EXECUTION_ID, async () => {}, { hostTools: serving });
		const started = await server.start();
		return { port: started.port, toolToken: started.mcpServer.env!['FLOW_MCP_TOOL_TOKEN']!, auditLines };
	};

	/** Sends one `call_tool` line and collects whatever the host writes until the socket closes. */
	const call = (
		started: Started,
		toolId: string,
		args: Record<string, string>
	): { socket: net.Socket; received: () => string } => {
		let received = '';
		const socket = net.createConnection(started.port, '127.0.0.1', () => {
			socket.write(
				JSON.stringify({
					v: 2,
					kind: 'call_tool',
					token: started.toolToken,
					executionId: EXECUTION_ID,
					callId: 'call-1',
					toolId,
					args,
				}) + '\n'
			);
		});
		socket.on('data', chunk => (received += chunk.toString('utf8')));
		socket.on('error', () => {});
		sockets.push(socket);
		return { socket, received: () => received };
	};

	/** Starts the sleeping tool and waits until both its process and its grandchild exist. */
	const startSleeping = async (started: Started, name: string): Promise<{ pids: number[]; socket: net.Socket }> => {
		const pidFile = path.join(workspace, `${name}-pids.txt`);
		const heartbeat = path.join(workspace, `${name}-beat.txt`);
		const { socket } = call(started, 'sleeper', { beat: heartbeat, pids: pidFile });
		await waitUntil(() => fs.existsSync(pidFile) && fs.existsSync(heartbeat), {
			timeoutMs: 10_000,
			failureMessage: 'the sleeping tool never started',
		});
		const pids = fs.readFileSync(pidFile, 'utf8').split(',').map(Number);
		expect(pids.every(isAlive)).toBe(true);
		return { pids, socket };
	};

	const auditOutcomes = (lines: string[]): Array<Record<string, unknown>> =>
		lines.map(line => JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>);

	it('stop() kills the tool and its grandchild, returns promptly, and audits "aborted: step ended"', async () => {
		const started = await startServer();
		const { pids } = await startSleeping(started, 'stop');

		const stoppedAt = Date.now();
		await server!.stop();
		expect(Date.now() - stoppedAt).toBeLessThan(2000);

		await waitUntil(() => pids.every(pid => !isAlive(pid)), {
			timeoutMs: 5000,
			failureMessage: 'the tool process or its grandchild survived McpServer.stop()',
		});
		await waitUntil(() => started.auditLines.length === 1, {
			timeoutMs: 5000,
			failureMessage: 'no audit line for the aborted call',
		});
		expect(auditOutcomes(started.auditLines)[0]).toMatchObject({
			outcome: 'aborted',
			reason: 'aborted: step ended',
			toolId: 'sleeper',
		});
	}, 30_000);

	it('a client socket closing mid-call kills the tool and its grandchild and audits "aborted: connection closed"', async () => {
		const started = await startServer();
		const { pids, socket } = await startSleeping(started, 'close');

		socket.destroy();
		await waitUntil(() => pids.every(pid => !isAlive(pid)), {
			timeoutMs: 5000,
			failureMessage: 'the tool process or its grandchild survived the client disconnect',
		});
		await waitUntil(() => started.auditLines.length === 1, {
			timeoutMs: 5000,
			failureMessage: 'no audit line for the aborted call',
		});
		expect(auditOutcomes(started.auditLines)[0]).toMatchObject({
			outcome: 'aborted',
			reason: 'aborted: connection closed',
		});
		// The server keeps serving: a normal call afterwards is answered.
		const quick = call(started, 'quick', {});
		await waitUntil(() => quick.received().includes('"ok":true'), {
			timeoutMs: 10_000,
			failureMessage: 'the server did not answer a normal call after an aborted one',
		});
	}, 30_000);

	it('a call that finishes normally is answered and audited as ok, then stop() is prompt', async () => {
		const started = await startServer();
		const quick = call(started, 'quick', {});
		await waitUntil(() => quick.received().includes('"ok":true'), {
			timeoutMs: 10_000,
			failureMessage: 'the normal call was not answered',
		});
		const stoppedAt = Date.now();
		await server!.stop();
		expect(Date.now() - stoppedAt).toBeLessThan(2000);
		expect(auditOutcomes(started.auditLines)).toHaveLength(1);
		expect(auditOutcomes(started.auditLines)[0]).toMatchObject({ outcome: 'ok' });
	}, 20_000);
});
