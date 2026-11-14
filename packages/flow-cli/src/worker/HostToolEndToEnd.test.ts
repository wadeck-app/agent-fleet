import type { HostTool } from 'flow-engine';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { InjectedStep } from '../ipc/Protocol';
import { HostToolFixtureDirectory } from '../test-utils/HostToolFixtureDirectory';
import { McpStdioTestClient } from '../test-utils/McpStdioTestClient';
import { HostToolStepWiring } from './HostToolStepWiring';
import { McpServer } from './McpServer';

/**
 * The whole slice-1 chain with no fake host: the real McpServer (loopback TCP, issued tokens), the real wiring, call
 * service, executor and audit log running real fixture executables, and the real mcp-server.cjs speaking MCP over stdio as
 * a model CLI would. The helper is configured ONLY with the command and env McpServer hands out.
 */

const STEP_ID = 'triage';
const EXECUTION_ID = 'exec-e2e';
const AUDIT_PREFIX = '[host-tool] ';
const ANY_TEXT = '^[\\s\\S]*$';

// Values that must never reach a tool child or the model: the worker's own credentials and the step's tokens.
const CANARIES = {
	FLOW_WORKER_TOKEN: 'canary-worker-token-1',
	FLOW_MCP_TOOL_TOKEN: 'canary-tool-token-2',
	FLOW_MCP_CALLBACK_TOKEN: 'canary-callback-token-3',
	FLOW_EXECUTION_ID: 'canary-execution-4',
	CANARY_UNDECLARED: 'canary-undeclared-5',
};
const DECLARED_CANARY = { name: 'CANARY_DECLARED', value: 'canary-declared-6' };

interface ToolReply {
	text: string;
	isError: boolean;
}

interface RunningStep {
	mcp: McpServer;
	client: McpStdioTestClient;
	/** What McpServer handed out: the helper command and its env. */
	handedOut: { command: string[]; env: Record<string, string> };
	auditLines: string[];
	injected: InjectedStep[];
}

describe('host tools end to end through the real MCP server, callback and executor', () => {
	let fixtures: HostToolFixtureDirectory;
	let workspace: string;
	const running: RunningStep[] = [];

	beforeAll(() => {
		fixtures = HostToolFixtureDirectory.create();
		workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-e2e-'));
	});
	afterAll(() => {
		fixtures.remove();
		fs.rmSync(workspace, { recursive: true, force: true });
	});
	afterEach(async () => {
		for (const step of running.splice(0)) {
			step.client.kill();
			await step.mcp.stop();
		}
	});

	const workerEnvironment = (): Record<string, string | undefined> => ({
		...process.env,
		...CANARIES,
		[DECLARED_CANARY.name]: DECLARED_CANARY.value,
	});

	const tools = (): HostTool[] => [
		fixtures.tool('echo.cjs', ['{text}', '--count={count}'], {
			id: 'echo-args',
			description: 'Echo the arguments back (test).',
			args: {
				text: { type: 'string', pattern: ANY_TEXT, required: true, description: 'Text to echo.' },
				count: { type: 'integer', min: 1, max: 5 },
			},
		}),
		fixtures.tool('echo.cjs', ['{text}'], {
			id: 'echo-logged',
			description: 'Echo, audit keeps the value (test).',
			args: { text: { type: 'string', pattern: ANY_TEXT, required: true, log: true } },
		}),
		fixtures.tool('echo.cjs', [], {
			id: 'echo-env',
			description: 'Echo the environment (test).',
			env: [DECLARED_CANARY.name],
		}),
		fixtures.tool('sleep.cjs', ['{beat}'], {
			id: 'sleeper',
			description: 'Sleeps past its timeout (test).',
			args: { beat: { type: 'string', pattern: ANY_TEXT, required: true } },
			timeoutSeconds: 1,
		}),
		fixtures.tool('flood.cjs', ['5000'], {
			id: 'flooder',
			description: 'Floods stdout (test).',
			maxOutputBytes: 2000,
		}),
		fixtures.tool('fail.cjs', [], { id: 'failer', description: 'Exits 3 (test).' }),
	];

	/** Wires and starts a step exactly as the worker does, then connects a model-CLI-like client to the helper. */
	const startStep = async (hostTools: HostTool[] | undefined): Promise<RunningStep> => {
		const auditLines: string[] = [];
		const injected: InjectedStep[] = [];
		const serving = HostToolStepWiring.prepare({
			stepId: STEP_ID,
			hostTools,
			workspaceDir: workspace,
			workerEnvironment: workerEnvironment(),
			writeAuditLine: line => auditLines.push(line),
		});
		const mcp = new McpServer(
			EXECUTION_ID,
			async steps => {
				injected.push(...steps);
			},
			serving === undefined ? {} : { hostTools: serving }
		);
		const { mcpServer } = await mcp.start();
		if (mcpServer.env === undefined) throw new Error('McpServer handed out no env');
		const handedOut = { command: mcpServer.command, env: mcpServer.env };
		const client = new McpStdioTestClient(handedOut.command, { ...process.env, ...handedOut.env });
		const step = { mcp, client, handedOut, auditLines, injected };
		running.push(step);
		await client.initialize();
		return step;
	};

	const call = async (step: RunningStep, name: string, args: unknown): Promise<ToolReply> => {
		const response = await step.client.request('tools/call', { name, arguments: args });
		if (response.result === undefined) throw new Error(`JSON-RPC error: ${JSON.stringify(response.error)}`);
		return { text: response.result.content[0].text, isError: response.result.isError === true };
	};

	/** The data between the untrusted-data tags of a tool reply. */
	const outputOf = (text: string): string => {
		const match = /<tool-output tool="[a-z0-9-]+" untrusted="true">\n([\s\S]*?)\n<\/tool-output>/.exec(text);
		if (match === null) throw new Error(`no untrusted-data block in: ${text}`);
		return match[1]!;
	};

	const audit = (step: RunningStep): Array<Record<string, any>> =>
		step.auditLines.map(line => {
			expect(line.startsWith(AUDIT_PREFIX)).toBe(true);
			return JSON.parse(line.slice(AUDIT_PREFIX.length));
		});

	const sha256 = (value: string): string => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

	describe('the MCP session as a model CLI drives it', () => {
		it('answers the initialized notification with nothing (a notification has no response)', async () => {
			const step = await startStep(tools());
			await step.client.request('ping', {});
			const lines = step.client.stdoutLines.map(line => JSON.parse(line));
			expect(lines.map(line => line.id)).toEqual([1, 2]);
			expect(step.client.stderrText).toBe('');
		});

		it('lists the tools with description and input schema, and nowhere a command, path, env name or token', async () => {
			const step = await startStep(tools());
			const response = await step.client.request('tools/list', {});
			const listed = response.result.tools as Array<Record<string, any>>;
			expect(listed.map(tool => tool.name)).toEqual([
				'provideSteps',
				'echo-args',
				'echo-logged',
				'echo-env',
				'sleeper',
				'flooder',
				'failer',
			]);
			const echo = listed[1]!;
			expect(Object.keys(echo).sort()).toEqual(['description', 'inputSchema', 'name']);
			// The model view appends what the tool does and takes; the declared description stays first.
			expect(echo.description).toMatch(
				/^Echo the arguments back \(test\)\. \(side effect: read; runs on the host; arguments: text \(string, required\), count \(integer 1\.\.5\)\)$/
			);
			expect(echo.inputSchema.required).toEqual(['text']);
			expect(Object.keys(echo.inputSchema.properties).sort()).toEqual(['count', 'text']);

			// Everything the model can read: the list, the env the helper got, and all the helper wrote.
			const seen = [
				JSON.stringify(listed),
				step.handedOut.env['FLOW_MCP_TOOLS'],
				step.client.everythingWritten,
			].join('\n');
			const forbidden = [
				process.execPath,
				fixtures.directory,
				'echo.cjs',
				'--count=',
				DECLARED_CANARY.name,
				DECLARED_CANARY.value,
				...Object.values(CANARIES),
				step.handedOut.env['FLOW_MCP_TOOL_TOKEN']!,
				step.handedOut.env['FLOW_MCP_CALLBACK_TOKEN']!,
			];
			for (const text of forbidden) {
				expect(seen, `"${text}" must not be visible to the model`).not.toContain(text);
			}
		});

		it('keeps provideSteps working through the same server when tools are declared', async () => {
			const step = await startStep(tools());
			const steps = [{ id: 'a', type: 'script', script: 'echo' }];
			const reply = await call(step, 'provideSteps', { steps });
			expect(reply.isError).toBe(false);
			// The v1 inject message is fire-and-forget: the model gets its reply when the helper wrote it, before the worker handled it.
			await vi.waitFor(() => expect(step.injected).toEqual(steps));
		});
	});

	describe('a call that runs', () => {
		it('runs the fixture through the callback, returns its stdout as untrusted data and audits names and hashes only', async () => {
			const step = await startStep(tools());
			const needle = 'needle-value-123';
			const reply = await call(step, 'echo-args', { text: needle, count: 3 });
			expect(reply.isError).toBe(false);
			expect(reply.text).toContain('<tool-output tool="echo-args" untrusted="true">');
			expect(reply.text.trimEnd().endsWith('exit code: 0')).toBe(true);
			const printed = JSON.parse(outputOf(reply.text));
			expect(printed.argv).toEqual([needle, '--count=3']);
			// No cwd written: a fresh empty directory, never the run workspace.
			expect(path.basename(printed.cwd)).toMatch(/^flow-hosttool-none-/);
			expect(fs.realpathSync(path.dirname(printed.cwd))).not.toBe(fs.realpathSync(workspace));

			const [entry, ...others] = audit(step);
			expect(others).toEqual([]);
			expect(entry).toMatchObject({
				stepId: STEP_ID,
				toolId: 'echo-args',
				outcome: 'ok',
				exitCode: 0,
				truncated: false,
				timedOut: false,
			});
			expect(entry!['args']).toEqual({ text: { sha256: sha256(needle) }, count: { sha256: sha256('3') } });
			// No value, and no output content: the fixture printed the argv and the whole environment.
			expect(step.auditLines.join('\n')).not.toContain(needle);
			expect(step.auditLines.join('\n')).not.toContain('"argv"');
			expect(entry!['outputBytes']).toBe(Buffer.byteLength(reply.text, 'utf8'));
		});

		it('drops an optional argument that was not given', async () => {
			const step = await startStep(tools());
			const reply = await call(step, 'echo-args', { text: 'only' });
			expect(JSON.parse(outputOf(reply.text)).argv).toEqual(['only']);
		});

		it('keeps the value in the audit line only for an argument declared log: true', async () => {
			const step = await startStep(tools());
			await call(step, 'echo-logged', { text: 'logged-value' });
			expect(audit(step)[0]!['args']).toEqual({
				text: { sha256: sha256('logged-value'), value: 'logged-value' },
			});
		});

		it('reports a failing tool as an error that still carries its output', async () => {
			const step = await startStep(tools());
			const reply = await call(step, 'failer', {});
			expect(reply.isError).toBe(true);
			expect(reply.text).toContain("Tool 'failer' failed with exit code 3");
			expect(reply.text).toContain('partial');
			expect(reply.text).toContain('boom: something went wrong');
			expect(audit(step)[0]).toMatchObject({ outcome: 'failed', exitCode: 3 });
		});
	});

	describe('injection corpus', () => {
		const marker = (): string => path.join(workspace, 'scribble.txt');
		const runner = (): string => `"${process.execPath}" "${fixtures.script('scribble.cjs')}"`;

		type Expectation = { argv: true } | { refusal: RegExp };
		const corpus: Array<[string, () => string, Expectation]> = [
			['a semicolon', () => 'a; id', { argv: true }],
			['a command substitution', () => '$(id)', { argv: true }],
			['backticks', () => '`id`', { argv: true }],
			['an and-chain that would write the marker', () => `x && ${runner()}`, { argv: true }],
			['a semicolon chain that would write the marker', () => `x; ${runner()}`, { argv: true }],
			['a newline that would write the marker', () => `x\n${runner()}`, { argv: true }],
			['a pipe and a redirect', () => 'a | cat > out.txt', { argv: true }],
			['a path traversal', () => '../..', { argv: true }],
			['a long value within the limit', () => 'x'.repeat(1000), { argv: true }],
			['a leading dash', () => '-rf', { refusal: /argument 'text' starts with '-'/ }],
			[
				'a value over the length limit',
				() => 'x'.repeat(2000),
				{ refusal: /argument 'text' is longer than 1024/ },
			],
			['a NUL character', () => 'a\u0000b', { refusal: /argument 'text' contains a NUL character/ }],
		];

		it.each(corpus)(
			'%s reaches the tool as one inert argument or is refused, and nothing else runs',
			async (_name, payload, expected) => {
				fs.rmSync(marker(), { force: true });
				const step = await startStep(tools());
				const value = payload();
				const reply = await call(step, 'echo-args', { text: value });
				if ('argv' in expected) {
					expect(reply.isError).toBe(false);
					expect(JSON.parse(outputOf(reply.text)).argv).toEqual([value]);
				} else {
					expect(reply.isError).toBe(true);
					expect(reply.text).toMatch(expected.refusal);
					expect(reply.text).toContain("Tool 'echo-args' was not run");
					expect(audit(step)[0]).toMatchObject({ outcome: 'denied' });
				}
				expect(fs.existsSync(marker())).toBe(false);
			}
		);
	});

	describe('a call that is refused', () => {
		it('names the declared tools when the id is not declared, over the helper and over the callback, and stays usable', async () => {
			const step = await startStep(tools());
			const response = await step.client.request('tools/call', { name: 'rm', arguments: {} });
			expect(response.error?.message).toContain('Available tools: provideSteps, echo-args, echo-logged');

			// A peer that skips the helper and holds the handed-out token still gets the host's own refusal.
			const reply = await rawCallback(step, { kind: 'call_tool', toolId: 'rm', args: {} });
			expect(reply).toMatchObject({ ok: false });
			expect(reply['text']).toContain(
				"Host tool 'rm' is not declared for this step. Allowed tools: echo-args, echo-logged"
			);

			expect((await call(step, 'echo-args', { text: 'still-works' })).isError).toBe(false);
		});

		it.each([
			['a wrong argument type', { text: 5 }, "argument 'text' must be a string"],
			[
				'a wrong integer type',
				{ text: 'a', count: 'three' },
				"argument 'count' must be an integer between 1 and 5",
			],
			[
				'an out-of-range integer',
				{ text: 'a', count: 99 },
				"argument 'count' must be an integer between 1 and 5",
			],
			['a missing required argument', {}, "argument 'text' is required"],
			['an unknown argument', { text: 'a', txt: 'b' }, "unknown argument 'txt'"],
		])('returns an actionable error for %s and the session stays usable', async (_name, args, message) => {
			const step = await startStep(tools());
			const reply = await call(step, 'echo-args', args);
			expect(reply.isError).toBe(true);
			expect(reply.text).toContain(message);
			expect(reply.text).toContain("Tool 'echo-args' was not run");
			expect((await call(step, 'echo-args', { text: 'next' })).isError).toBe(false);
			expect(audit(step).map(entry => entry['outcome'])).toEqual(['denied', 'ok']);
		});
	});

	describe('limits', () => {
		it('stops at timeoutSeconds, tells the model, and kills the detached grandchild', async () => {
			const step = await startStep(tools());
			const beat = path.join(workspace, 'beat.txt');
			fs.rmSync(beat, { force: true });
			const reply = await call(step, 'sleeper', { beat });
			expect(reply.isError).toBe(true);
			expect(reply.text).toContain("Tool 'sleeper' timed out after 1 s");
			expect(audit(step)[0]).toMatchObject({ outcome: 'timed_out', timedOut: true });

			// The grandchild beat while it lived (proof it existed) and stops once the tree is killed.
			expect(fs.statSync(beat).size).toBeGreaterThan(0);
			// A live grandchild appends every 100 ms: let a few intervals pass, then the file must be settled.
			await sleep(500);
			const settled = fs.statSync(beat).size;
			await sleep(400);
			expect(fs.statSync(beat).size).toBe(settled);
		});

		it('truncates output over maxOutputBytes with a marker, keeps the reply under the cap and flags the audit line', async () => {
			const step = await startStep(tools());
			const reply = await call(step, 'flooder', {});
			expect(reply.text).toContain('[output truncated at ');
			expect(Buffer.byteLength(reply.text, 'utf8')).toBeLessThanOrEqual(2000);
			expect(audit(step)[0]).toMatchObject({ outcome: 'ok', truncated: true });
		});
	});

	describe('the child environment', () => {
		it('never carries the worker credentials or step tokens, nor undeclared variables; a declared one arrives', async () => {
			const step = await startStep(tools());
			const reply = await call(step, 'echo-env', {});
			expect(reply.isError).toBe(false);
			const env = JSON.parse(outputOf(reply.text)).env as Record<string, string>;
			expect(env[DECLARED_CANARY.name]).toBe(DECLARED_CANARY.value);
			expect(Object.keys(env).filter(name => /^FLOW_/i.test(name))).toEqual([]);
			expect(Object.keys(env)).not.toContain('CANARY_UNDECLARED');
			for (const value of Object.values(CANARIES)) {
				expect(reply.text).not.toContain(value);
			}
			expect(step.auditLines.join('\n')).not.toContain(DECLARED_CANARY.value);
		});

		it.each([
			['FLOW_WORKER_TOKEN'],
			['FLOW_MCP_TOOL_TOKEN'],
			['FLOW_MCP_CALLBACK_TOKEN'],
			['FLOW_EXECUTION_ID'],
			['FLOW_SANDBOX_HOST_SECRET'],
		])('refuses at run start a tool that declares %s, before any server exists', async name => {
			const declaring = fixtures.tool('echo.cjs', [], { id: 'greedy', env: [name] });
			await expect(startStep([declaring])).rejects.toThrow(
				new RegExp(
					`Step '${STEP_ID}' tool 'greedy': env name '${name}' is never passed to host tools.*Fix: remove it from env`
				)
			);
			expect(running).toEqual([]);
		});
	});

	describe('a step without host tools', () => {
		it.each([[undefined], [[]]])(
			'behaves as before: only provideSteps, no tool token, v1 inject works (%j)',
			async hostTools => {
				const step = await startStep(hostTools as HostTool[] | undefined);
				expect(step.handedOut.env).not.toHaveProperty('FLOW_MCP_TOOLS');
				expect(step.handedOut.env).not.toHaveProperty('FLOW_MCP_TOOL_TOKEN');
				const listed = await step.client.request('tools/list', {});
				expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['provideSteps']);

				const steps = [{ id: 'a', type: 'script', script: 'echo' }];
				expect((await call(step, 'provideSteps', { steps })).isError).toBe(false);
				// Fire-and-forget v1 message (see above): wait for the worker to handle it.
				await vi.waitFor(() => expect(step.injected).toEqual(steps));

				const unknown = await step.client.request('tools/call', { name: 'echo-args', arguments: {} });
				expect(unknown.error?.message).toContain('Available tools: provideSteps');
			}
		);
	});

	describe('McpServer.stop()', () => {
		it('revokes both capabilities: a call after stop fails with a message that says the execution may have ended', async () => {
			const step = await startStep(tools());
			expect((await call(step, 'echo-args', { text: 'before' })).isError).toBe(false);
			await step.mcp.stop();

			const tool = await call(step, 'echo-args', { text: 'after' });
			expect(tool.isError).toBe(true);
			expect(tool.text).toMatch(/cannot reach the flow host callback.*the execution may have ended/);
			expect(audit(step)).toHaveLength(1);

			const inject = await call(step, 'provideSteps', { steps: [{ id: 'b', type: 'script', script: 'echo' }] });
			expect(inject.isError).toBe(true);
			expect(inject.text).toContain('Failed to inject steps');
			expect(step.injected).toEqual([]);
		});
	});

	/** One v2 line on the handed-out port with the handed-out tool token, bypassing the helper. */
	const rawCallback = (
		step: RunningStep,
		line: { kind: string; toolId: string; args: unknown }
	): Promise<Record<string, any>> =>
		new Promise((resolve, reject) => {
			const env = step.handedOut.env;
			const socket = net.createConnection(Number(env['FLOW_MCP_CALLBACK_PORT']), '127.0.0.1', () => {
				socket.write(
					JSON.stringify({
						v: 2,
						...line,
						token: env['FLOW_MCP_TOOL_TOKEN'],
						executionId: env['FLOW_EXECUTION_ID'],
						callId: 'raw-1',
					}) + '\n'
				);
			});
			let received = '';
			socket.on('data', chunk => (received += chunk.toString('utf8')));
			socket.on('error', reject);
			socket.on('close', () =>
				received === '' ? reject(new Error('closed without a reply')) : resolve(JSON.parse(received))
			);
		});
});
