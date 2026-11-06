import type { ChildProcess, SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from '../FakeClock';
import { type FakeExecHandler, FakeSandboxRuntime } from '../FakeSandboxRuntime';
import { RunMounts } from '../RunMounts';
import { SandboxError } from '../SandboxError';
import type { SandboxRuntime } from '../SandboxRuntime';
import { eachRow } from '../testing/EachRow';
import { MockSbxHarness } from '../testing/MockSbxHarness';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import { McpCallbackRules } from './McpCallbackRules';
import { FIRST_SYNTHETIC_PID } from './SandboxChildProcess';
import { SbxProcessLauncher } from './SbxProcessLauncher';
import { StepCommandTranslator } from './StepCommandTranslator';
import { VmEnvironmentFilter } from './VmEnvironmentFilter';
import { VmExecutableLookup } from './VmExecutableLookup';
import { VmFileStager } from './VmFileStager';

const SANDBOX = 'flow-sbx-test-run1';
const HOST_NODE = process.execPath;

let root: string;
let workspace: string;
let meta: string;
let hostTemp: string;
let elsewhere: string;
let log: RecordingSandboxLog;
let events: string[];
let ensureCalls: number;
let stopImplementation: () => Promise<void>;
let harness: MockSbxHarness | undefined;
let lookup: VmExecutableLookup;

function sandboxForm(hostPath: string): string {
	const normalized = hostPath.replace(/\\/g, '/');
	const drive = /^([A-Za-z]):(.*)$/.exec(normalized);
	return drive?.[1] === undefined ? normalized : `/${drive[1].toLowerCase()}${drive[2] ?? ''}`;
}

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-launcher-')));
	workspace = path.join(root, 'ws');
	meta = path.join(root, 'ws.meta');
	hostTemp = path.join(root, 'tmp');
	elsewhere = path.join(root, 'elsewhere');
	for (const directory of [workspace, meta, hostTemp, elsewhere]) fs.mkdirSync(directory);
	log = new RecordingSandboxLog();
	events = [];
	ensureCalls = 0;
	stopImplementation = () => Promise.resolve();
	harness = undefined;
});

afterEach(() => {
	harness?.dispose();
	fs.rmSync(root, { recursive: true, force: true });
});

function launcherFor(
	runtime: SandboxRuntime,
	options: { hostEnvironment?: NodeJS.ProcessEnv; inputWaitMs?: number } = {}
): SbxProcessLauncher {
	const mounts = new RunMounts({ workspaceDir: workspace, workspaceMetaDir: meta, platform: process.platform, log });
	lookup = new VmExecutableLookup(runtime);
	return new SbxProcessLauncher({
		runtime,
		sandbox: SANDBOX,
		translator: new StepCommandTranslator({
			mounts,
			stager: new VmFileStager({
				runtime,
				log,
				hostTempDirectory: hostTemp,
				hostNodePath: HOST_NODE,
				platform: process.platform,
			}),
			environment: new VmEnvironmentFilter(options.hostEnvironment ?? {}),
			hostNodePath: HOST_NODE,
			log,
			declaredEnvironmentNames: new Set(['STEP_VAR']),
		}),
		lookup,
		mcpRules: new McpCallbackRules(runtime, log),
		log,
		stopSandbox: () => {
			events.push('stop');
			return stopImplementation();
		},
		ensureRunning: () => {
			ensureCalls += 1;
			return Promise.resolve();
		},
		...(options.inputWaitMs === undefined ? {} : { inputWaitMs: options.inputWaitMs }),
	});
}

async function fakeRuntime(handler: FakeExecHandler): Promise<FakeSandboxRuntime> {
	const runtime = new FakeSandboxRuntime({ clock: new FakeClock(0), execHandler: handler });
	await runtime.create({ name: SANDBOX, agent: 'claude', mounts: [{ hostPath: workspace }], cpus: 1, memory: '1g' });
	return runtime;
}

async function mockRuntime(): Promise<SandboxRuntime> {
	harness = new MockSbxHarness();
	const runtime = harness.runtime();
	await runtime.create({
		name: SANDBOX,
		agent: 'claude',
		mounts: [{ hostPath: workspace }, { hostPath: meta }],
		cpus: 1,
		memory: '1g',
	});
	return runtime;
}

interface Finished {
	code: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	error?: Error;
}

function collect(child: ChildProcess): Promise<Finished> {
	return new Promise(resolve => {
		let stdout = '';
		let stderr = '';
		let error: Error | undefined;
		child.stdout?.on('data', (data: Buffer) => (stdout += data.toString()));
		child.stderr?.on('data', (data: Buffer) => (stderr += data.toString()));
		child.on('error', (failure: Error) => (error = failure));
		child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr, ...(error ? { error } : {}) }));
	});
}

const pipes: SpawnOptions = { stdio: ['ignore', 'pipe', 'pipe'] };

describe('SbxProcessLauncher spawn against the fake runtime', () => {
	it('runs the command in the VM with translated cwd and filtered env, and reports the exit code', async () => {
		const seen: { command: readonly string[]; cwd?: string; env?: Readonly<Record<string, string>> }[] = [];
		const runtime = await fakeRuntime((request, context) => {
			seen.push({ command: request.command, cwd: request.cwd, env: request.env });
			context.emitStdout('out\n');
			context.emitStderr('err\n');
			return { exitCode: 7, stdout: 'out\n', stderr: 'err\n' };
		});
		const launcher = launcherFor(runtime);
		const child = launcher.spawn('echo', ['hi'], {
			...pipes,
			cwd: workspace,
			env: { PATH: 'C:\\Git\\bin', HOME: 'C:\\Users\\me', STEP_VAR: 'v' },
		});
		const result = await collect(child);
		expect(result).toMatchObject({ code: 7, signal: null, stdout: 'out\n', stderr: 'err\n' });
		expect(child.exitCode).toBe(7);
		expect(seen).toEqual([{ command: ['echo', 'hi'], cwd: sandboxForm(workspace), env: { STEP_VAR: 'v' } }]);
		expect(log.text()).toMatch(
			/process timing \{"pid":\d+,"program":"echo","prepareMs":\d+,"ruleMs":\d+,"execMs":\d+\}/
		);
		await launcher.whenIdle();
	});

	it('does not forward what the engine copied from the host environment (script steps are not isolated by the engine)', async () => {
		let forwarded: Readonly<Record<string, string>> | undefined;
		const runtime = await fakeRuntime(request => {
			forwarded = request.env;
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const launcher = launcherFor(runtime, {
			hostEnvironment: { FLOW_WORKER_TOKEN: 'launch-token', STEP_VAR: 'host-value' },
		});
		await collect(
			launcher.spawn('env', [], {
				...pipes,
				env: { FLOW_WORKER_TOKEN: 'launch-token', STEP_VAR: 'host-value', OTHER: '1' },
			})
		);
		// STEP_VAR is declared by the step in this test (same value as the host's on purpose); the token is not.
		expect(forwarded).toEqual({ STEP_VAR: 'host-value', OTHER: '1' });
		expect(log.text()).not.toContain('launch-token');
	});

	it('asks the lifecycle to make sure the sandbox runs before every process (a kill may have stopped it)', async () => {
		const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
		const launcher = launcherFor(runtime);

		await collect(launcher.spawn('true', [], pipes));
		await collect(launcher.spawn('true', [], pipes));

		expect(ensureCalls).toBe(2);
	});

	it('gives a synthetic pid that is never a host pid', async () => {
		const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
		const launcher = launcherFor(runtime);
		const first = launcher.spawn('true', [], pipes);
		const second = launcher.spawn('true', [], pipes);
		expect(first.pid).toBeGreaterThanOrEqual(FIRST_SYNTHETIC_PID);
		expect(second.pid).not.toBe(first.pid);
		await Promise.all([collect(first), collect(second)]);
	});

	it('passes stdin written right after spawn, and an empty input when stdin is a pipe that stays unwritten', async () => {
		const inputs: (string | undefined)[] = [];
		const runtime = await fakeRuntime(request => {
			inputs.push(request.stdin === undefined ? undefined : String(request.stdin));
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const launcher = launcherFor(runtime, { inputWaitMs: 20 });
		const written = launcher.spawn('claude', ['-p'], { stdio: ['pipe', 'pipe', 'pipe'] });
		written.stdin?.write('the prompt');
		written.stdin?.end();
		await collect(written);
		const ignored = launcher.spawn('true', [], pipes);
		await collect(ignored);
		const open = launcher.spawn('cat', [], { stdio: ['pipe', 'pipe', 'pipe'] });
		await collect(open);
		expect(inputs).toEqual(['the prompt', undefined, '']);
		expect(log.text()).toMatch(/its stdin was left open without input/);
	});

	it('runs a command line with shell: true under sh -c', async () => {
		let command: readonly string[] = [];
		const runtime = await fakeRuntime(request => {
			command = request.command;
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		await collect(launcherFor(runtime).spawn('echo $PWD | wc -c', { ...pipes, shell: true }));
		expect(command).toEqual(['/bin/sh', '-c', 'echo $PWD | wc -c']);
	});

	it('stages the generated bash script and runs it with the VM bash', async () => {
		const commands: (readonly string[])[] = [];
		const stdins: string[] = [];
		const runtime = await fakeRuntime(request => {
			commands.push(request.command);
			stdins.push(String(request.stdin ?? ''));
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const script = path.join(hostTemp, 'agent-fleet-script-5-zz.sh');
		fs.writeFileSync(script, 'echo from-the-vm');
		await collect(
			launcherFor(runtime).spawn('C:\\Program Files\\Git\\usr\\bin\\bash.exe', ['-e', '-u', script], {
				...pipes,
				cwd: workspace,
			})
		);
		expect(stdins[0]).toBe('echo from-the-vm');
		const [, , , , count, copy, ...program] = commands[1] ?? [];
		expect(count).toBe('1');
		expect(copy).toMatch(/^\/tmp\/flow-staged\/.*agent-fleet-script-5-zz\.sh$/);
		expect(program).toEqual(['bash', '-e', '-u', copy]);
	});

	it('fails the process (error then close) with the reason when a hostile path is passed, and never calls exec', async () => {
		let execs = 0;
		const runtime = await fakeRuntime(() => {
			execs += 1;
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const secret = path.join(elsewhere, 'secret.txt');
		fs.writeFileSync(secret, 'host secret');
		const result = await collect(launcherFor(runtime).spawn('cat', [secret], pipes));
		expect(result.error).toBeInstanceOf(SandboxError);
		expect((result.error as SandboxError).kind).toBe('path-outside-mounts');
		expect(result.code).toBeNull();
		expect(execs).toBe(0);
	});

	it('fails the process for a cwd outside the mounts', async () => {
		const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
		const result = await collect(launcherFor(runtime).spawn('pwd', [], { ...pipes, cwd: elsewhere }));
		expect((result.error as SandboxError).kind).toBe('path-outside-mounts');
	});

	it('reports an sbx failure as an error event', async () => {
		const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
		runtime.failNext('exec', new SandboxError('binary-missing', 'Cannot start sbx'));
		const result = await collect(launcherFor(runtime).spawn('true', [], pipes));
		expect(result.error?.message).toBe('Cannot start sbx');
		expect(result.code).toBeNull();
	});

	it('ignores stdout and stderr when asked to', async () => {
		const runtime = await fakeRuntime((_request, context) => {
			context.emitStdout('dropped');
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const child = launcherFor(runtime).spawn('true', [], { stdio: ['ignore', 'ignore', 'ignore'] });
		expect(child.stdout).toBeNull();
		expect(child.stderr).toBeNull();
		expect((await collect(child)).code).toBe(0);
	});

	it('refuses interactive stdio (each case) before anything starts', () =>
		eachRow([['inherit'], [['inherit', 'pipe', 'pipe']], [['ignore', 'inherit', 'inherit']]], async stdio => {
			const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
			expect(() => launcherFor(runtime).spawn('claude', [], { stdio: stdio as never })).toThrow(
				/only "pipe" and "ignore" are supported/
			);
			expect(runtime.callsTo('exec')).toHaveLength(0);
		}));
});

describe('SbxProcessLauncher MCP callback rule', () => {
	it("opens a sandbox-scoped rule for the step's callback port before the process and removes it after", async () => {
		const order: string[] = [];
		const runtime = await fakeRuntime(request => {
			order.push(request.stdin !== undefined ? 'stage' : 'run');
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const originalAllow = runtime.allowNetwork.bind(runtime);
		runtime.allowNetwork = async request => {
			order.push(`allow:${request.resources.join(',')}`);
			await originalAllow(request);
		};
		const originalRemove = runtime.removeNetwork.bind(runtime);
		runtime.removeNetwork = async request => {
			order.push(`remove:${request.resources.join(',')}`);
			await originalRemove(request);
		};
		const config = path.join(hostTemp, 'mcp-config-1.json');
		fs.writeFileSync(
			config,
			JSON.stringify({
				mcpServers: {
					flow: {
						command: HOST_NODE,
						args: [path.join(root, 'mcp-server.cjs')],
						env: { FLOW_MCP_CALLBACK_PORT: '43210', FLOW_MCP_CALLBACK_TOKEN: 't', FLOW_EXECUTION_ID: 'e' },
					},
				},
			})
		);
		const result = await collect(launcherFor(runtime).spawn('claude', ['--mcp-config', config, '-p'], pipes));
		expect(result.code).toBe(0);
		expect(order).toEqual(['stage', 'allow:localhost:43210', 'run', 'remove:localhost:43210']);
	});

	it('removes the rule even when the process fails', async () => {
		const runtime = await fakeRuntime(request => {
			if (request.stdin === undefined) return { exitCode: 1, stdout: '', stderr: '' };
			return { exitCode: 0, stdout: '', stderr: '' };
		});
		const config = path.join(hostTemp, 'mcp-config-2.json');
		fs.writeFileSync(
			config,
			JSON.stringify({
				mcpServers: {
					flow: {
						command: HOST_NODE,
						args: [path.join(root, 'mcp-server.cjs')],
						env: { FLOW_MCP_CALLBACK_PORT: '43211' },
					},
				},
			})
		);
		const result = await collect(launcherFor(runtime).spawn('claude', ['--mcp-config', config], pipes));
		expect(result.code).toBe(1);
		expect(runtime.callsTo('removeNetwork')).toHaveLength(1);
	});
});

describe('SbxProcessLauncher ending processes', () => {
	/** An exec that never returns until its host side is aborted, like `sbx exec` of a program that keeps running. */
	function hanging(onStarted: () => void): FakeExecHandler {
		return (request, context) =>
			new Promise((_resolve, reject) => {
				context.emitStdout('running\n');
				onStarted();
				request.signal?.addEventListener('abort', () =>
					reject(new SandboxError('aborted', 'The sbx command was aborted.'))
				);
			});
	}

	it('killTree stops the SANDBOX first, then aborts the host exec, and the process closes with the signal', async () => {
		let started: () => void = () => undefined;
		const running = new Promise<void>(resolve => (started = resolve));
		const runtime = await fakeRuntime(
			hanging(() => {
				events.push('exec-started');
				started();
			})
		);
		const launcher = launcherFor(runtime);
		const child = launcher.spawn('sleep', ['600'], pipes);
		const finished = collect(child);
		await running;
		stopImplementation = () => {
			events.push('stop-done');
			return Promise.resolve();
		};
		launcher.killTree(child.pid as number, 'SIGKILL');
		const result = await finished;
		expect(events).toEqual(['exec-started', 'stop', 'stop-done']);
		expect(result).toMatchObject({ code: null, signal: 'SIGKILL' });
		expect(child.killed).toBe(true);
		expect(child.signalCode).toBe('SIGKILL');
		expect(log.text()).toMatch(/stopping the sandbox \(a host-side abort does not end a process in the VM\)/);
	});

	it('child.kill() ends it the same way, SIGTERM by default, and a second kill stops the sandbox only once', async () => {
		let started: () => void = () => undefined;
		const running = new Promise<void>(resolve => (started = resolve));
		const runtime = await fakeRuntime(hanging(() => started()));
		const launcher = launcherFor(runtime);
		const child = launcher.spawn('sleep', ['600'], pipes);
		const finished = collect(child);
		await running;
		child.kill();
		child.kill('SIGKILL');
		launcher.killTree(child.pid as number, 'SIGKILL');
		const result = await finished;
		expect(events).toEqual(['stop']);
		expect(result.signal).toBe('SIGTERM');
	});

	it('killTreeAndWait resolves after the process is gone and never rejects, even when the stop fails', async () => {
		let started: () => void = () => undefined;
		const running = new Promise<void>(resolve => (started = resolve));
		const runtime = await fakeRuntime(hanging(() => started()));
		const launcher = launcherFor(runtime);
		const child = launcher.spawn('sleep', ['600'], pipes);
		const finished = collect(child);
		await running;
		stopImplementation = () => Promise.reject(new Error('sbx stop failed'));
		await expect(launcher.killTreeAndWait(child)).resolves.toBeUndefined();
		const result = await finished;
		expect(result.signal).toBe('SIGKILL');
		expect(result.stderr).toMatch(
			/the sandbox could not be stopped \(sbx stop failed\).*Run: sbx stop flow-sbx-test-run1/
		);
		expect(log.text()).toMatch(/warn: could not stop sandbox "flow-sbx-test-run1": sbx stop failed/);
	});

	it('does not stop the sandbox for a process that already ended (the engine kills after every launch)', async () => {
		const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
		const launcher = launcherFor(runtime);
		const child = launcher.spawn('true', [], pipes);
		await collect(child);
		launcher.killTree(child.pid as number, 'SIGKILL');
		await launcher.killTreeAndWait(child);
		expect(child.kill()).toBe(false);
		expect(events).toEqual([]);
	});

	it('a kill requested before the exec started prevents the exec', async () => {
		const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
		const launcher = launcherFor(runtime);
		const child = launcher.spawn('true', [], pipes);
		child.kill('SIGKILL');
		const result = await collect(child);
		expect(result.signal).toBe('SIGKILL');
		expect(runtime.callsTo('exec')).toHaveLength(0);
	});

	it('refuses to end a pid that is not a sandbox process (never a host process)', async () => {
		const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
		const launcher = launcherFor(runtime);
		expect(() => launcher.killTree(process.pid, 'SIGKILL')).toThrow(/not a sandbox process of this launcher/);
		expect(() => launcher.snapshotDescendants(process.pid)).toThrow(/not a sandbox process of this launcher/);
	});

	it('snapshotDescendants is empty for a sandbox process and signalProcesses refuses real pids', async () => {
		const runtime = await fakeRuntime(() => ({ exitCode: 0, stdout: '', stderr: '' }));
		const launcher = launcherFor(runtime);
		const child = launcher.spawn('true', [], pipes);
		expect(launcher.snapshotDescendants(child.pid as number)).toEqual([]);
		expect(() => launcher.signalProcesses([], 'SIGTERM')).not.toThrow();
		expect(() => launcher.signalProcesses([1234], 'SIGKILL')).toThrow(/cannot be signalled by a host pid/);
		await collect(child);
	});
});

describe('SbxProcessLauncher lookupExecutable', () => {
	it('answers from the table primed in the VM, and throws before it is primed or for an unknown program', async () => {
		const runtime = await fakeRuntime(() => ({
			exitCode: 0,
			stdout: 'claude=/home/agent/.local/bin/claude\n',
			stderr: '',
		}));
		const launcher = launcherFor(runtime);
		expect(() => launcher.lookupExecutable('where claude')).toThrow(/No executable lookup was primed/);
		await lookup.prime(SANDBOX);
		expect(launcher.lookupExecutable('where claude')).toBe('/home/agent/.local/bin/claude');
		expect(launcher.lookupExecutable('which claude')).toBe('/home/agent/.local/bin/claude');
		expect(() => launcher.lookupExecutable('which codex')).toThrow(/"codex" is not installed/);
	});
});

describe('SbxProcessLauncher against the sbx mock (real sbx child processes)', () => {
	it('ends a program that keeps running: the sandbox is stopped, then the host sbx exec is killed', async () => {
		const runtime = await mockRuntime();
		const launcher = launcherFor(runtime);
		stopImplementation = () => runtime.stop(SANDBOX);
		const child = launcher.spawn('hang', [], pipes);
		const finished = collect(child);
		await new Promise<void>(resolve => child.stdout?.once('data', () => resolve()));
		launcher.killTree(child.pid as number, 'SIGKILL');
		const result = await finished;
		expect(result).toMatchObject({ code: null, signal: 'SIGKILL' });
		expect(result.stdout).toBe('hanging\n');
		const calls = (harness as MockSbxHarness).calls().map(call => call.argv[0]);
		expect(calls).toContain('stop');
	});
});
