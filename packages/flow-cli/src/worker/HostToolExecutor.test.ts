import type { HostTool } from 'flow-engine';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HostToolFixtureDirectory } from '../test-utils/HostToolFixtureDirectory';
import { observeFor } from '../test-utils/WaitHelpers';
import { HostToolExecutableResolver } from './HostToolExecutableResolver';
import { HostToolExecutor } from './HostToolExecutor';
import type { HostToolExecutionResult } from './HostToolExecutor';
import { HostToolLimits } from './HostToolLimits';

const CANARIES = {
	FLOW_WORKER_TOKEN: 'WORKER-TOKEN-CANARY',
	FLOW_MCP_TOOL_TOKEN: 'TOOL-TOKEN-CANARY',
	FLOW_MCP_CALLBACK_TOKEN: 'CALLBACK-TOKEN-CANARY',
	AWS_SECRET_ACCESS_KEY: 'AWS-CANARY',
	TASK_PROFILE: 'work-profile',
};

describe('HostToolExecutor (real processes)', () => {
	let fixtures: HostToolFixtureDirectory;
	let workspace: string;
	const workerEnvironment = { ...process.env, ...CANARIES };
	const resolver = new HostToolExecutableResolver({ environment: process.env });
	const executor = new HostToolExecutor({ workerEnvironment, resolver });

	const run = (tool: HostTool, values: Record<string, string> = {}): Promise<HostToolExecutionResult> =>
		executor.execute({
			stepId: 'triage',
			tool,
			executable: resolver.resolve('triage', tool),
			values,
			limits: HostToolLimits.resolve(tool),
			workspaceDir: workspace,
		});

	const echoed = (result: HostToolExecutionResult): { argv: string[]; env: Record<string, string>; cwd: string } => {
		const body = /<tool-output[^>]*>\n([\s\S]*?)\n(?:stderr:[\s\S]*?\n)?<\/tool-output>/.exec(result.reply.text);
		if (body === null) throw new Error(`no output block in: ${result.reply.text}`);
		return JSON.parse(body[1]!) as { argv: string[]; env: Record<string, string>; cwd: string };
	};

	beforeAll(() => {
		fixtures = HostToolFixtureDirectory.create();
		workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-hosttool-ws-'));
	});
	afterAll(() => {
		fixtures.remove();
		fs.rmSync(workspace, { recursive: true, force: true });
	});

	describe('argv: substituted values are inert (F-03, F-04)', () => {
		it.each([
			{ name: 'a command separator', value: 'a; rm -rf x' },
			{ name: 'a command substitution', value: '$(id)' },
			{ name: 'backticks', value: '`id`' },
			{ name: 'a logical and', value: 'a && b' },
			{ name: 'a pipe', value: 'x | cat' },
			{ name: 'a path traversal', value: '../../etc/passwd' },
			{ name: 'a dash option', value: '-rf' },
			{ name: 'a newline', value: 'a\nb' },
			{ name: 'a glob', value: '*.txt' },
			{ name: 'quotes', value: `"a" 'b'` },
			{ name: 'a very long value', value: 'z'.repeat(1024) },
		])('$name arrives as ONE argv element, byte for byte', async ({ value }) => {
			const result = await run(fixtures.tool('echo.cjs', ['{v}']), { v: value });
			expect(result.reply.ok).toBe(true);
			expect(echoed(result).argv).toEqual([value]);
		});

		it('a flag placeholder arrives as one element', async () => {
			const result = await run(fixtures.tool('echo.cjs', ['--id={v}']), { v: 'a b; c' });
			expect(echoed(result).argv).toEqual(['--id=a b; c']);
		});
	});

	describe('environment (F-05)', () => {
		it('passes the baseline and the declared names, and never the tokens, even when declared (canary)', async () => {
			const tool = fixtures.tool('echo.cjs', [], {
				env: ['TASK_PROFILE', 'FLOW_WORKER_TOKEN', 'FLOW_MCP_TOOL_TOKEN', 'flow_mcp_callback_token'],
			});
			const result = await run(tool);
			const environment = echoed(result).env;
			expect(environment['TASK_PROFILE']).toBe('work-profile');
			expect(environment['PATH'] ?? environment['Path']).toBeDefined();
			expect(JSON.stringify(environment)).not.toContain('CANARY');
			expect(result.envDenied.sort()).toEqual(
				['FLOW_MCP_TOOL_TOKEN', 'FLOW_WORKER_TOKEN', 'flow_mcp_callback_token'].sort()
			);
		});

		it('does not pass an undeclared variable of the worker (AWS canary)', async () => {
			const result = await run(fixtures.tool('echo.cjs'));
			expect(JSON.stringify(echoed(result).env)).not.toContain('AWS-CANARY');
		});

		it('reports declared names the worker does not have', async () => {
			const result = await run(fixtures.tool('echo.cjs', [], { env: ['NOT_SET_ANYWHERE'] }));
			expect(result.envMissing).toEqual(['NOT_SET_ANYWHERE']);
		});
	});

	describe('working directory (F-13)', () => {
		// Fail closed: no cwd written means a fresh empty directory, never the workspace the model can write.
		it('default (no cwd written): a fresh empty directory, not the run workspace', async () => {
			fs.writeFileSync(path.join(workspace, 'planted.txt'), 'x');
			const result = await run(fixtures.tool('cwd.cjs'));
			const listing = JSON.parse(
				/<tool-output[^>]*>\n([\s\S]*?)\n<\/tool-output>/.exec(result.reply.text)![1]!
			) as { entries: string[] };
			expect(listing.entries).toEqual([]);
		});

		it('workspace: the process starts in the run workspace', async () => {
			const result = await run(fixtures.tool('echo.cjs', [], { cwd: 'workspace' }));
			expect(fs.realpathSync(echoed(result).cwd)).toBe(fs.realpathSync(workspace));
		});

		it('none: a fresh empty directory that is not the OS temp directory, removed after the call', async () => {
			const result = await run(fixtures.tool('scribble.cjs', [], { cwd: 'none' }));
			const used = /<tool-output[^>]*>\n([\s\S]*?)\n<\/tool-output>/.exec(result.reply.text)![1]!;
			expect(fs.realpathSync(path.dirname(used))).toBe(fs.realpathSync(os.tmpdir()));
			expect(path.resolve(used)).not.toBe(path.resolve(os.tmpdir()));
			expect(path.basename(used)).toMatch(/^flow-hosttool-none-/);
			expect(fs.existsSync(used)).toBe(false);
		});

		it('none: the directory is empty when the tool starts', async () => {
			const result = await run(fixtures.tool('cwd.cjs', [], { cwd: 'none' }));
			const listing = JSON.parse(
				/<tool-output[^>]*>\n([\s\S]*?)\n<\/tool-output>/.exec(result.reply.text)![1]!
			) as {
				entries: string[];
			};
			expect(listing.entries).toEqual([]);
		});

		it('refuses with a named error when the workspace directory does not exist', async () => {
			const tool = fixtures.tool('echo.cjs', [], { cwd: 'workspace' });
			const result = await executor.execute({
				stepId: 'triage',
				tool,
				executable: resolver.resolve('triage', tool),
				values: {},
				limits: HostToolLimits.resolve(tool),
				workspaceDir: path.join(workspace, 'does-not-exist'),
			});
			expect(result.reply.ok).toBe(false);
			expect(result.reply.text).toMatch(/workspace directory .* does not exist/);
		});
	});

	describe('failures are actionable', () => {
		it('a non-zero exit is not ok, carries the exit code, and shows stdout and stderr as data', async () => {
			const result = await run(fixtures.tool('fail.cjs'));
			expect(result.reply).toMatchObject({ ok: false, exitCode: 3 });
			expect(result.reply.text).toContain('exit code 3');
			expect(result.reply.text).toContain('partial');
			expect(result.reply.text).toContain('stderr:\nboom: something went wrong');
		});
	});

	describe('output cap (F-12)', () => {
		it('truncates, marks it, reports truncated, and stays within maxOutputBytes', async () => {
			const result = await run(fixtures.tool('flood.cjs', ['200000'], { maxOutputBytes: 1000 }));
			expect(result.reply.truncated).toBe(true);
			expect(result.reply.ok).toBe(true);
			expect(Buffer.byteLength(result.reply.text, 'utf8')).toBeLessThanOrEqual(1000);
			expect(result.reply.text).toMatch(/\[output truncated at \d+ bytes\]/);
			expect(result.stdoutBytes).toBe(200_000);
		});

		it('never splits a multi-byte character', async () => {
			const result = await run(fixtures.tool('flood.cjs', ['5000', 'é'], { maxOutputBytes: 701 }));
			expect(result.reply.text).not.toContain('�');
			expect(Buffer.byteLength(result.reply.text, 'utf8')).toBeLessThanOrEqual(701);
		});

		it('does not mark a small output', async () => {
			const result = await run(fixtures.tool('flood.cjs', ['10']));
			expect(result.reply.truncated).toBe(false);
			expect(result.reply.text).not.toContain('truncated');
		});
	});

	describe('timeout kills the whole tree (F-12)', () => {
		it('stops the child AND its grandchild, replies ok:false timedOut:true', async () => {
			const heartbeat = path.join(workspace, 'heartbeat.txt');
			const started = Date.now();
			const result = await run(fixtures.tool('sleep.cjs', [heartbeat], { timeoutSeconds: 1 }));
			expect(result.reply).toMatchObject({ ok: false, timedOut: true, exitCode: null });
			expect(result.reply.text).toMatch(/timed out after 1 s/);
			expect(Date.now() - started).toBeLessThan(10_000);
			// The grandchild was alive (it wrote) and is dead now (it stopped writing).
			const sizeAtReply = fs.statSync(heartbeat).size;
			expect(sizeAtReply).toBeGreaterThan(0);
			await observeFor(800);
			expect(fs.statSync(heartbeat).size).toBe(sizeAtReply);
		}, 20_000);
	});

	describe('executable identity is checked before every spawn (F-16)', () => {
		it('refuses when the recorded identity no longer matches, and runs nothing', async () => {
			const tool = fixtures.tool('echo.cjs');
			const resolved = resolver.resolve('triage', tool);
			const result = await executor.execute({
				stepId: 'triage',
				tool,
				executable: { ...resolved, size: resolved.size + 1 },
				values: {},
				limits: HostToolLimits.resolve(tool),
				workspaceDir: workspace,
			});
			expect(result.reply).toMatchObject({ ok: false, exitCode: null });
			expect(result.reply.text).toMatch(/Step 'triage' tool 'fixture-tool': .*changed/);
			expect(result.reply.text).not.toContain('<tool-output');
		});
	});

	it('reports the duration', async () => {
		const result = await run(fixtures.tool('slow.cjs', ['300']));
		expect(result.durationMs).toBeGreaterThanOrEqual(250);
	});
});
