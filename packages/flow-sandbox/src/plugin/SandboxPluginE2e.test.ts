import { addProject } from '@wadeck-app/project-sdk';
import { createIsolatedCliEnv } from 'flow-cli/src/test-utils/IsolatedCliEnv';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PluginBundler } from '../PluginBundler';
import { DaemonIsolationGuard } from '../testing/DaemonIsolationGuard';
import { MOCK_SBX_PATH, type MockSbxCall } from '../testing/MockSbxHarness';

/**
 * END TO END WITHOUT A VM: a real flow daemon of this checkout (started from source with tsx, like ExecLiveCheck.mjs), the
 * sandbox plugin from the BUILT artifact (declared with `--plugin sandbox.exec --plugins-dir`), the exec wrapper it starts, and
 * the sbx MOCK in place of sbx (selected with the plugin option sbxPath). Everything is isolated: own config dir, project
 * registry, home and temp, ports chosen by the daemon; the developer's real daemon and configuration are never touched.
 *
 * WHAT THIS PROVES
 * - the daemon builds the source from the artifact and asks it for a worker; the wrapper registers with the launch credential;
 * - a run with `requires: [sandbox]` is served by that worker (the execution record names the source and the step output);
 * - the sbx command lines the wrapper issues, in order: create (explicit --cpus and -m, exactly the two mounts), the setup and the
 *   step's exec, then `rm --force` at the end of the run, while the mounted directories still exist; the daemon releases the pool
 *   slot (its claim folder disappears) only after the wrapper's ack, which follows the removal: asserted on the timestamp of the
 *   `rm` call versus the disappearance of the claim;
 * - a second run gets another sandbox, served by the same, still registered, worker;
 * - no launch credential appears on an sbx command line, in a recorded environment or in the daemon log;
 * - a source that cannot start makes the bound step fail with the daemon's own "Last contact with source ... failed" message.
 *
 * WHAT IT DOES NOT PROVE
 * - ANY isolation. The mock runs no VM and no bash: the script step does NOT run, the mock answers with canned output
 *   (scenario bash-canned). Whether code really runs in a sandbox is the live check's question.
 * - that the real sbx accepts these flags (they are only checked against the captured --help), that the image exists, Bedrock,
 *   the duration of a real `sbx rm`, or the Windows file locks on a mounted directory.
 */

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const flowIndex = path.join(repositoryRoot, 'packages', 'flow-cli', 'src', 'cli', 'FlowIndex.ts');
const tsxUrl = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const CANNED = 'canned-output-of-the-mock';
const CANARY = 'canary-of-the-wrapper-environment';
const BOUND_WAIT_SECONDS = 6;
/** `flow stop` of one world and the wait for its daemon process to leave: the two bounds of {@link FlowWorld.stop}. */
const STOP_COMMAND_BOUND_MS = 30_000;
const DAEMON_EXIT_BOUND_MS = 15_000;
/** The longest one world can take to stop (the worlds are stopped TOGETHER, so this is also the bound of all of them), plus its 300 ms pause. */
const WORLD_STOP_BOUND_MS = STOP_COMMAND_BOUND_MS + DAEMON_EXIT_BOUND_MS + 1_000;
/** Removing the plugin artifact after the stops: a bound for a hang, not a wait. */
const ARTIFACT_REMOVAL_BOUND_MS = 30_000;

interface ExecutionRecord {
	status?: string;
	/** What the daemon resolved when it accepted the run; `implicit` names the entries it added to model steps. */
	requirements?: {
		run?: string[];
		steps?: Record<string, string[]>;
		implicit?: { requires: string[]; steps: string[] };
	};
	steps?: Record<
		string,
		{ status?: string; error?: string; sourceId?: string; workerId?: string; io?: { stdout?: { text?: string } } }
	>;
}

class FlowWorld {
	readonly isolation = createIsolatedCliEnv();
	readonly root = fs.realpathSync.native(this.isolation.root);
	readonly projectDirectory = path.join(this.root, 'project');
	readonly mockState = path.join(this.root, 'sbx-state');
	readonly poolDirectory = path.join(this.root, 'pool');
	readonly claimFolder = path.join(this.poolDirectory, '.flow-pool', 'slot-1.claim');
	/** One entry per run served through the sandbox: when its pool claim was first seen and when it disappeared (epoch ms). */
	readonly releases: { seenAt: number | undefined; goneAt: number }[] = [];
	readonly daemonLog = path.join(this.root, 'daemon.log');
	readonly env: NodeJS.ProcessEnv;
	projectId = '';
	daemon: ChildProcess | undefined;

	/** @param scrubModelCredentials remove every ANTHROPIC_*, AWS_* and CLAUDE_* variable: a model step routed to a host worker must not be able to call a real model. */
	constructor(scrubModelCredentials = false) {
		fs.mkdirSync(this.projectDirectory, { recursive: true });
		fs.mkdirSync(this.mockState, { recursive: true });
		fs.mkdirSync(path.join(this.poolDirectory, 'slot-1'), { recursive: true });
		this.env = {
			...this.isolation.env,
			SBX_MOCK_STATE_DIR: this.mockState,
			SBX_MOCK_SCENARIO: 'bash-canned',
			SBX_MOCK_BASH_STDOUT: CANNED,
			// The engine's own mock model CLIs (CLAUDE.md: every model provider is tested with mocks, never real APIs): `exec codex ...` runs this script.
			SBX_MOCK_CODEX_CLI: path.join(
				repositoryRoot,
				'packages',
				'flow-engine',
				'src',
				'testing',
				'codex-mock.mjs'
			),
			SBX_MOCK_OPENCODE_CLI: path.join(
				repositoryRoot,
				'packages',
				'flow-engine',
				'src',
				'testing',
				'opencode-mock.mjs'
			),
			// A variable of the wrapper's environment that no step declares: a host script (host: true) must never see it.
			FLOW_SANDBOX_E2E_CANARY: CANARY,
			// A daemon with nothing to do stops after its idle check: keep it for the whole test.
			FLOW_DAEMON_IDLE_CHECK_MS: '600000',
			// The OS picks the daemon port: the user's own daemon (standard range) is never probed or competed with.
			FLOW_DAEMON_PORT: '0',
		};
		delete this.env['SBX_MOCK_PATH'];
		if (scrubModelCredentials) {
			for (const name of Object.keys(this.env)) {
				if (/^(ANTHROPIC_|AWS_|CLAUDE_)/i.test(name)) delete this.env[name];
			}
		}
		DaemonIsolationGuard.assert({ env: this.env, isolatedRoot: this.root });
		fs.writeFileSync(
			path.join(this.isolation.configDir, 'config.yml'),
			`worker:\n  boundStepWaitSeconds: ${BOUND_WAIT_SECONDS}\n`
		);
	}

	flow(
		args: string[],
		timeoutMs = 120_000,
		cwd: string = this.projectDirectory
	): { status: number | null; stdout: string; stderr: string } {
		const result = spawnSync(process.execPath, ['--import', tsxUrl, flowIndex, ...args], {
			env: this.env,
			cwd,
			encoding: 'utf8',
			timeout: timeoutMs,
			windowsHide: true,
		});
		return { status: result.status, stdout: result.stdout, stderr: result.stderr };
	}

	/**
	 * Same as {@link flow} without blocking this process: the claim watcher (a timer) must keep ticking while a flow command runs. A blocking
	 * `spawnSync` of about a second starves it, and a run that ends faster than that (a step the wrapper refused) would have its pool claim
	 * created and released without the watcher ever seeing it, which the test then reports as "the claim was never released".
	 */
	flowAsync(args: string[], timeoutMs = 120_000): Promise<{ status: number | null; stdout: string; stderr: string }> {
		return new Promise(resolve => {
			const child = spawn(process.execPath, ['--import', tsxUrl, flowIndex, ...args], {
				env: this.env,
				cwd: this.projectDirectory,
				windowsHide: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
			child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
			const timer = setTimeout(() => child.kill(), timeoutMs);
			child.on('close', status => {
				clearTimeout(timer);
				resolve({ status, stdout, stderr });
			});
		});
	}

	async registerProject(): Promise<void> {
		const registry = path.join(String(this.env['XDG_CONFIG_HOME']), 'project');
		this.projectId = (await addProject(registry, { name: 'e2e', path: this.projectDirectory })).id;
	}

	/** A second registered project, with its own directory (the flows of a project are looked up and run from its directory). */
	async registerOtherProject(name: string): Promise<{ id: string; directory: string }> {
		const directory = path.join(this.root, name);
		fs.mkdirSync(directory, { recursive: true });
		const registry = path.join(String(this.env['XDG_CONFIG_HOME']), 'project');
		return { id: (await addProject(registry, { name, path: directory })).id, directory };
	}

	/** `projects` is the option that scopes the source (the core reads that name from the declared entry). Default: the first registered project. */
	declareSource(
		sourceId: string,
		pluginsDirectory: string,
		sbxPath: string,
		projects: string = this.projectId
	): void {
		const declared = this.flow([
			'worker',
			'source',
			'add',
			sourceId,
			'--provider',
			'sandbox',
			'--plugin',
			'sandbox.exec',
			'--plugins-dir',
			pluginsDirectory,
			'--option',
			`projects=${projects}`,
			'--option',
			'region=us-east-1',
			'--option',
			'profiles=claude=mock-profile',
			'--option',
			`sbxPath=${sbxPath}`,
			'--option',
			'acceptSshAgentForwarding=true',
		]);
		if (declared.status !== 0)
			throw new Error(`declaring ${sourceId} failed: ${declared.stderr}${declared.stdout}`);
	}

	async startDaemon(): Promise<void> {
		const log = fs.openSync(this.daemonLog, 'a');
		this.daemon = spawn(process.execPath, ['--import', tsxUrl, flowIndex], {
			env: { ...this.env, FLOW_DAEMON_MODE: '1' },
			cwd: repositoryRoot,
			stdio: ['ignore', log, log],
			windowsHide: true,
		});
		try {
			await waitFor('the daemon to publish worker.port', 60_000, () =>
				fs.existsSync(path.join(this.isolation.configDir, 'worker.port'))
			);
		} catch (error) {
			// The daemon log says why it did not come up (for example a configuration it refused).
			throw new Error(`${String(error)}\ndaemon log:\n${this.log().slice(-3000)}`);
		}
	}

	/**
	 * One script step. `true` asks for the sandbox with `requires: [sandbox]`; `false` asks for nothing; an object chooses an explicit
	 * `requires` list (flow level) and/or the REMOVED `workerType: sandbox` line (only to prove the daemon rejects it).
	 */
	writeFlow(
		name: string,
		binding: boolean | { removedWorkerType?: boolean; requires?: string[]; profile?: string },
		workspace: 'pool' | 'in-place' = 'pool'
	): string {
		const chosen = binding === true ? { requires: ['sandbox'] } : binding === false ? {} : binding;
		const file = path.join(this.projectDirectory, `${name}.yml`);
		fs.writeFileSync(
			file,
			[
				`id: ${name}`,
				"version: '1.0.0'",
				`name: ${name}`,
				'description: One script step.',
				...(chosen.removedWorkerType === true ? ['workerType: sandbox'] : []),
				...(chosen.requires !== undefined ? [`requires: [${chosen.requires.join(', ')}]`] : []),
				...(chosen.profile !== undefined ? [`profile: ${chosen.profile}`] : []),
				// A sandboxed worker accepts only a pool (the in-place workspace would expose <project>/.flow and .git/hooks).
				workspace === 'pool'
					? `workspace: { provider: pool, dir: '${this.poolDirectory.replaceAll(path.sep, '/')}', prefix: slot-, count: 1 }`
					: 'workspace: in-place',
				'steps:',
				'    - id: probe',
				'      name: Probe',
				'      type: script',
				'      shell: bash',
				'      script: echo hello',
				'',
			].join('\n')
		);
		return file;
	}

	/** One model step per entry (ids ask1, ask2, ...), each with its own provider, model and prompt; no `requires`, no `profile`: the daemon decides. */
	writeToolFlow(name: string, steps: { provider?: string; model: string; prompt: string }[]): string {
		const file = path.join(this.projectDirectory, `${name}.yml`);
		fs.writeFileSync(
			file,
			[
				`id: ${name}`,
				"version: '1.0.0'",
				`name: ${name}`,
				'description: Model steps of several tools.',
				`workspace: { provider: pool, dir: '${this.poolDirectory.replaceAll(path.sep, '/')}', prefix: slot-, count: 1 }`,
				'steps:',
				...steps.flatMap((step, index) => [
					`    - id: ask${index + 1}`,
					`      name: Ask ${index + 1}`,
					'      type: model',
					...(step.provider === undefined ? [] : [`      provider: ${step.provider}`]),
					`      model: ${step.model}`,
					`      prompt: ${step.prompt}`,
					'      output:',
					'          answer:',
					'              type: string',
					'              from: last_message',
				]),
				'',
			].join('\n')
		);
		return file;
	}

	/** A flow of model steps (ids ask1, ask2, ...) that writes no `requires` and no `profile`: the daemon decides. */
	writeModelFlow(
		name: string,
		modelSteps: number,
		workspace: 'pool' | 'in-place' = 'pool',
		directory: string = this.projectDirectory
	): string {
		const file = path.join(directory, `${name}.yml`);
		fs.writeFileSync(
			file,
			[
				`id: ${name}`,
				"version: '1.0.0'",
				`name: ${name}`,
				'description: Model steps without requirements.',
				workspace === 'pool'
					? `workspace: { provider: pool, dir: '${this.poolDirectory.replaceAll(path.sep, '/')}', prefix: slot-, count: 1 }`
					: 'workspace: in-place',
				'steps:',
				...Array.from({ length: modelSteps }, (_unused, index) => [
					`    - id: ask${index + 1}`,
					`      name: Ask ${index + 1}`,
					'      type: model',
					'      model: sonnet',
					'      prompt: Reply with the single word OK.',
				]).flat(),
				'',
			].join('\n')
		);
		return file;
	}

	/**
	 * A pool flow bound with `requires: [sandbox]` whose steps are, in order, a script marked `host: true` (id `host`, it prints
	 * the canary variable if it can see it) and/or an unmarked script (id `vm`).
	 */
	writeHostFlow(name: string, steps: ('host' | 'vm')[], profile?: string): string {
		const file = path.join(this.projectDirectory, `${name}.yml`);
		const scripts = {
			host: [
				'    - id: host',
				'      name: Host',
				'      type: script',
				'      host: true',
				'      shell: bash',
				'      script: echo "ran-on-host canary=${FLOW_SANDBOX_E2E_CANARY:-absent}"',
			],
			vm: [
				'    - id: vm',
				'      name: Vm',
				'      type: script',
				'      shell: bash',
				'      script: echo hello',
			],
		};
		fs.writeFileSync(
			file,
			[
				`id: ${name}`,
				"version: '1.0.0'",
				`name: ${name}`,
				'description: Host and VM script steps.',
				...(profile === undefined ? ['requires: [sandbox]'] : [`profile: ${profile}`]),
				`workspace: { provider: pool, dir: '${this.poolDirectory.replaceAll(path.sep, '/')}', prefix: slot-, count: 1 }`,
				'steps:',
				...steps.flatMap(step => scripts[step]),
				'',
			].join('\n')
		);
		return file;
	}

	/** Starts a flow and returns its execution id. */
	start(file: string): string {
		const started = this.flow(['run', file, '--json']);
		const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
		if (match === null)
			throw new Error(
				`no executionId from flow run: ${started.stdout}${started.stderr}\n${this.describeDaemon()}`
			);
		return match[1] as string;
	}

	/** Runs a flow and waits until its execution settles. */
	async run(file: string, timeoutMs = 90_000): Promise<ExecutionRecord> {
		// Asynchronous start: the claim watcher of runAndRelease must tick while `flow run` is running (see flowAsync).
		const started = await this.flowAsync(['run', file, '--json']);
		const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
		if (match === null)
			throw new Error(
				`no executionId from flow run: ${started.stdout}${started.stderr}\n${this.describeDaemon()}`
			);
		return this.settle(match[1] as string, timeoutMs);
	}

	/** Waits until an execution settles. */
	async settle(executionId: string, timeoutMs = 90_000): Promise<ExecutionRecord> {
		return waitFor(`execution ${executionId} to settle`, timeoutMs, async () => {
			const shown = await this.flowAsync(['show', executionId, '--json']);
			if (shown.status !== 0) return undefined;
			const parsed = JSON.parse(shown.stdout) as ExecutionRecord;
			return ['completed', 'failed', 'cancelled'].includes(parsed.status ?? '') ? parsed : undefined;
		});
	}

	/**
	 * Runs a flow, then waits until the wrapper has removed the run's sandbox (end-of-run notice, then `sbx rm`), so everything the
	 * tests look at afterwards (sbx calls, log lines) exists. The daemon no longer logs the release of a workspace (the workspace
	 * providers: an in-place workspace has nothing to release), so the removal itself is the signal.
	 */
	/**
	 * `removesASandbox`: true waits for the sandbox removal and the claim release; false returns at once; 'no-sandbox' waits only for the claim
	 * release (a run in which the wrapper created no sandbox, for example a step it refused).
	 */
	async runAndRelease(file: string, removesASandbox: boolean | 'no-sandbox' = true): Promise<ExecutionRecord> {
		const removals = (): number => this.sbxCalls().filter(call => call.argv[0] === 'rm').length;
		const before = removals();
		const claimWatch = this.watchClaim();
		let record: ExecutionRecord;
		try {
			record = await this.run(file);
		} catch (error) {
			claimWatch.stop();
			throw error;
		}
		if (removesASandbox === false) {
			claimWatch.stop();
			return record;
		}
		if (removesASandbox === 'no-sandbox') {
			await this.waitForClaimRelease(claimWatch);
			return record;
		}
		try {
			await waitFor('the wrapper to remove the run sandbox', 40_000, () => removals() > before || undefined);
		} catch (error) {
			// The calls and the end of the daemon log say what the wrapper did instead.
			const calls = this.sbxCalls().map(call => call.argv.join(' '));
			const tail = this.log().slice(-3000);
			throw new Error(`${String(error)}\nsbx calls:\n${calls.join('\n')}\ndaemon log (tail):\n${tail}`);
		}
		// The daemon releases the pool slot (the claim folder disappears) only after the wrapper's ack, which follows the removal of the
		// sandbox and of its rules: that is the end of the run for everything the tests look at, and what the next run waits for.
		await this.waitForClaimRelease(claimWatch);
		return record;
	}

	private watchClaim(): { stop(): void; seenAt(): number | undefined; goneAt(): number | undefined } {
		let seenAt: number | undefined;
		let goneAt: number | undefined;
		const timer = setInterval(() => {
			const present = fs.existsSync(this.claimFolder);
			if (present && seenAt === undefined) seenAt = Date.now();
			if (!present && seenAt !== undefined && goneAt === undefined) goneAt = Date.now();
		}, 20);
		return { stop: () => clearInterval(timer), seenAt: () => seenAt, goneAt: () => goneAt };
	}

	private async waitForClaimRelease(watch: ReturnType<FlowWorld['watchClaim']>): Promise<void> {
		let goneAt: number;
		try {
			// The run is over when this is called and its claim was created before `flow run` answered, so a claim absent NOW is a released one,
			// even if no 20 ms tick ever saw it present (a run that needs no sandbox is released within a few ms of its end; a starved CI runner
			// can skip the whole window, and the watcher alone would then wait for a state change that already happened).
			goneAt = await waitFor(
				`the daemon to release the pool slot (${this.claimFolder} to disappear after the wrapper's ack)`,
				30_000,
				() => watch.goneAt() ?? (fs.existsSync(this.claimFolder) ? undefined : Date.now())
			);
		} catch (error) {
			const calls = this.sbxCalls().map(call => call.argv.slice(0, 2).join(' '));
			throw new Error(
				`${String(error)}. The wrapper removes the sandbox, then acknowledges the end of the run; if the claim never goes, the ack did not arrive. Claim ever seen by the watcher: ${watch.seenAt() === undefined ? 'no' : 'yes'}; present now: ${String(fs.existsSync(this.claimFolder))}.\nsbx calls:\n${calls.join('\n')}\ndaemon log (tail):\n${this.log().slice(-3000)}`
			);
		} finally {
			watch.stop();
		}
		this.releases.push({ seenAt: watch.seenAt(), goneAt });
	}

	sbxCalls(): MockSbxCall[] {
		const file = path.join(this.mockState, 'calls.jsonl');
		if (!fs.existsSync(file)) return [];
		return fs
			.readFileSync(file, 'utf8')
			.split('\n')
			.filter(line => line !== '')
			.map(line => JSON.parse(line) as MockSbxCall);
	}

	log(): string {
		return fs.existsSync(this.daemonLog) ? fs.readFileSync(this.daemonLog, 'utf8') : '';
	}

	/** What a failing test needs to know about this world's daemon: is its process alive, and the end of its log. */
	describeDaemon(): string {
		const daemon = this.daemon;
		const state =
			daemon === undefined
				? 'never started'
				: daemon.exitCode === null && daemon.signalCode === null
					? `pid ${String(daemon.pid)} alive`
					: `pid ${String(daemon.pid)} EXITED (code ${String(daemon.exitCode)}, signal ${String(daemon.signalCode)})`;
		return `daemon: ${state}; log tail:\n${this.log().slice(-2500)}\n${this.daemonOwnLogTail()}`;
	}

	/**
	 * The daemons' OWN log (`<config>/logs/*.ndjson`: idle decisions, "failed to start", yield to an incumbent), written by every daemon of
	 * this world, also one that `flow run` started by itself and that never wrote to {@link daemonLog}.
	 */
	private daemonOwnLogTail(): string {
		const directory = path.join(this.isolation.configDir, 'logs');
		if (!fs.existsSync(directory)) return `no daemon log directory (${directory})`;
		const tails = fs
			.readdirSync(directory)
			.filter(name => name.endsWith('.ndjson'))
			.sort()
			.map(name => `${name}:\n${fs.readFileSync(path.join(directory, name), 'utf8').slice(-2500)}`);
		return `daemon own log (${directory}):\n${tails.join('\n') || '(no file)'}`;
	}

	/**
	 * Stops the daemon THIS world started (never another one); its wrapper leaves when the connection closes. Bounded by
	 * {@link WORLD_STOP_BOUND_MS}; a failure names the world and shows the end of its daemon log (the cleanup still runs).
	 */
	async stop(): Promise<void> {
		const daemon = this.daemon;
		try {
			if (daemon?.pid !== undefined && daemon.exitCode === null) {
				// Asynchronous: the daemons of all worlds are stopped together (afterAll), and a blocking spawn per world would add up.
				await this.flowAsync(['stop'], STOP_COMMAND_BOUND_MS);
				await waitFor(
					'the daemon to exit',
					DAEMON_EXIT_BOUND_MS,
					() => daemon.exitCode !== null || undefined
				).catch(() => undefined);
				if (daemon.exitCode === null) daemon.kill();
			}
			await new Promise(resolve => setTimeout(resolve, 300));
		} catch (error) {
			throw new Error(`stopping the world in ${this.root} failed: ${String(error)}\n${this.describeDaemon()}`);
		} finally {
			this.isolation.cleanup();
		}
	}
}

async function waitFor<T>(
	what: string,
	timeoutMs: number,
	probe: () => T | undefined | Promise<T | undefined>
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
		await new Promise(resolve => setTimeout(resolve, 300));
	}
}

/** The sandbox a `create` call made, and the calls that name it. */
/** The execution id in `<project>/.flow/runs/<executionId>.meta`. */
function runIdOf(metaDirectory: string): string {
	return path.basename(metaDirectory).replace(/\.meta$/, '');
}

function sandboxesCreated(calls: MockSbxCall[]): string[] {
	return calls.filter(call => call.argv[0] === 'create').map(call => call.argv[2] as string);
}

let artifactRoot: string;
let artifactDirectory: string;
const worlds: FlowWorld[] = [];

beforeAll(async () => {
	artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-e2e-art-'));
	artifactDirectory = path.join(artifactRoot, 'dist-plugin');
	await new PluginBundler().bundle(artifactDirectory);
}, 120_000);

// Every world owns a real daemon. Stopped one after the other they needed several seconds each on a busy machine and vitest's default hook limit is
// 10 s (captured under CPU contention: "Hook timed out in 10000ms" here, after every test had passed). They are stopped together, the limit is the bound of
// one stop plus the artifact removal, and a failed stop is reported with its world's daemon log instead of a bare timeout.
afterAll(async () => {
	const outcomes = await Promise.allSettled(worlds.map(world => world.stop()));
	fs.rmSync(artifactRoot, { recursive: true, force: true });
	const failures = outcomes.flatMap(outcome => (outcome.status === 'rejected' ? [String(outcome.reason)] : []));
	if (failures.length > 0) throw new Error(failures.join('\n\n'));
}, WORLD_STOP_BOUND_MS + ARTIFACT_REMOVAL_BOUND_MS);

describe('sandbox plugin, real daemon, sbx mock: a healthy source', () => {
	const world = new FlowWorld();
	worlds.push(world);
	let first: ExecutionRecord;

	beforeAll(async () => {
		await world.registerProject();
		world.declareSource('sandbox-1', artifactDirectory, MOCK_SBX_PATH);
		await world.startDaemon();
		first = await world.runAndRelease(world.writeFlow('bound-one', true));
	}, 150_000);

	it('serves a bound run through the sandbox worker and issues the sbx commands in order, rm last', () => {
		const step = first.steps?.['probe'];
		expect(first.status).toBe('completed');
		expect(step).toMatchObject({ status: 'completed', sourceId: 'sandbox-1' });
		expect(step?.io?.stdout?.text).toBe(CANNED);

		const calls = world.sbxCalls();
		const [sandbox] = sandboxesCreated(calls);
		const named = calls.filter(call => call.argv.includes(sandbox as string));
		const verbs = named.map(call => call.argv[0]);
		const create = named.find(call => call.argv[0] === 'create');
		const stepExec = named.findIndex(call => call.argv[0] === 'exec' && call.argv.includes('-w'));
		const removal = named.findIndex(call => call.argv[0] === 'rm');

		expect(create?.argv.slice(3, 8)).toEqual(['--cpus', '2', '-m', '2g', 'claude']);
		// Exactly the two mounts: the pool slot (the workspace) and the run's .meta in the project's .flow/runs, outside the slot.
		const mounts = create?.argv.slice(8) ?? [];
		expect(mounts).toHaveLength(2);
		expect(mounts[0]).toBe(path.join(world.poolDirectory, 'slot-1'));
		expect(mounts[1]).toBe(
			path.join(world.projectDirectory, '.flow', 'runs', `${runIdOf(mounts[1] as string)}.meta`)
		);
		expect(verbs.indexOf('create')).toBe(0);
		expect(stepExec).toBeGreaterThan(0);
		expect(removal).toBeGreaterThan(stepExec);
		expect(named[removal]?.argv).toEqual(['rm', '--force', sandbox]);
	});

	// The daemon no longer logs the release of a workspace; the release of a pool slot is the disappearance of its claim folder.
	it('removes the sandbox while both mounted directories still exist on the host, and the daemon releases the pool slot only after the removal call', () => {
		const calls = world.sbxCalls();
		const [sandbox] = sandboxesCreated(calls);
		const removal = calls.find(call => call.argv[0] === 'rm' && call.argv.includes(sandbox as string));
		const log = world.log();

		// Still mounted when rm arrived: the directories existed on the host at that instant.
		expect(Object.values(removal?.mountsExistAtRm ?? {})).toEqual([true, true]);
		expect(log.indexOf(`Sandbox "${sandbox}" removed`)).toBeGreaterThan(-1);
		const release = world.releases[0];
		expect(release?.seenAt, 'the pool claim was never seen').toBeDefined();
		expect(removal?.at, 'the mock did not stamp the rm call').toBeDefined();
		expect(release?.goneAt).toBeGreaterThanOrEqual(removal?.at as number);
	});

	it('starts a second run on a fresh sandbox, served by the same wrapper, and removes that one too', async () => {
		const second = await world.runAndRelease(world.writeFlow('bound-two', true));

		const calls = world.sbxCalls();
		const created = sandboxesCreated(calls);
		expect(second.status).toBe('completed');
		expect(created).toHaveLength(2);
		expect(created[1]).not.toBe(created[0]);
		expect(second.steps?.['probe']?.workerId).toBe(first.steps?.['probe']?.workerId);
		const state = JSON.parse(fs.readFileSync(path.join(world.mockState, 'state.json'), 'utf8')) as {
			sandboxes: object;
		};
		expect(Object.keys(state.sandboxes)).toEqual([]);
	}, 120_000);

	it('puts no launch credential on any sbx command line, in any recorded environment or stdin, or in the daemon log', () => {
		const everything = [
			...world.sbxCalls().flatMap(call => [call.argv.join(' '), call.stdin, call.envFileContent ?? '']),
			world.log(),
		].join('\n');

		// Launch credentials are 64 hexadecimal characters; nothing of that shape may appear.
		expect(everything).not.toMatch(/\b[0-9a-f]{64}\b/);
		for (const call of world.sbxCalls()) expect((call as { workerEnv?: string[] }).workerEnv).toEqual([]);
	});

	// D9: the core reads the accepted workspace kinds from the manifest and refuses at run start, before any allocation.
	it('refuses at run start (WORKSPACE_KIND_NOT_ACCEPTED) a sandbox-requiring flow with an in-place workspace: no run, no sandbox, no slot', () => {
		const createsBefore = sandboxesCreated(world.sbxCalls()).length;
		const runFolders = (): string[] => {
			const directory = path.join(world.projectDirectory, '.flow', 'runs');
			return fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
		};
		const runsBefore = runFolders();

		const started = world.flow(['run', world.writeFlow('in-place', true, 'in-place'), '--json']);

		const output = `${started.stdout}${started.stderr}`;
		expect(started.status).not.toBe(0);
		expect(output).toContain('WORKSPACE_KIND_NOT_ACCEPTED');
		expect(output).toMatch(/in-place[\s\S]*pool|pool[\s\S]*in-place/);
		expect(output).not.toMatch(/"executionId"/);
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(createsBefore);
		// Nothing was allocated: no run folder in the project, no claim folder in the pool.
		expect(runFolders()).toEqual(runsBefore);
		expect(fs.existsSync(path.join(world.poolDirectory, '.flow-pool', 'slot-1.claim'))).toBe(false);
	});

	// fs=readonly-enforced: the daemon resolves profile: inspect into requirements, the wrapper builds the mounts from them. The mock
	// proves the command line (the `:ro` is enforced by the real sbx: PluginLiveCheck); a run without the requirement keeps a read/write workspace.
	it('creates the sandbox of a profile: inspect run with .meta as the read/write primary and the pool slot as a :ro secondary mount', async () => {
		const createsBefore = sandboxesCreated(world.sbxCalls()).length;

		const record = await world.runAndRelease(world.writeFlow('inspect-run', { profile: 'inspect' }));

		expect(record.status).toBe('completed');
		const creates = world.sbxCalls().filter(call => call.argv[0] === 'create');
		expect(creates).toHaveLength(createsBefore + 1);
		const mounts = (creates.at(-1)?.argv ?? []).slice(8);
		expect(mounts).toHaveLength(2);
		expect(mounts[0]).toBe(
			path.join(world.projectDirectory, '.flow', 'runs', `${runIdOf(mounts[0] as string)}.meta`)
		);
		expect(mounts[1]).toBe(`${path.join(world.poolDirectory, 'slot-1')}:ro`);
	}, 120_000);

	it('keeps the pool slot read/write and first for a run that does not ask for read-only (the capability is not a default)', async () => {
		const record = await world.runAndRelease(world.writeFlow('not-inspect', { profile: 'agent' }));

		expect(record.status).toBe('completed');
		const mounts = (
			world
				.sbxCalls()
				.filter(call => call.argv[0] === 'create')
				.at(-1)?.argv ?? []
		).slice(8);
		expect(mounts[0]).toBe(path.join(world.poolDirectory, 'slot-1'));
		expect(mounts.some(mount => mount.endsWith(':ro'))).toBe(false);
	}, 120_000);

	// The failed-run path: the wrapper refuses a step (here host: true under a read-only profile), the run ends failed, and the daemon must
	// still release the pool slot after the wrapper's end-of-run ack. Pinned because a CI run on another host timed out waiting for the claim
	// after a step had failed; this proves the release does not depend on the step having succeeded.
	it('releases the pool slot of a run whose step the wrapper refused (no sandbox was created)', async () => {
		const createsBefore = sandboxesCreated(world.sbxCalls()).length;
		const file = world.writeHostFlow('refused-run', ['host'], 'inspect');

		const record = await world.runAndRelease(file, 'no-sandbox');

		expect(record.status).toBe('failed');
		expect(record.steps?.['host']?.error).toMatch(/host: true cannot satisfy fs=readonly-enforced/);
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(createsBefore);
	}, 120_000);

	it('a flow that asks for a SUBSET of the guarantees (fs=confined) is served by the requirement-only source too', async () => {
		const before = sandboxesCreated(world.sbxCalls()).length;

		const record = await world.runAndRelease(world.writeFlow('subset', { requires: ['fs=confined'] }));

		expect(record.status).toBe('completed');
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(before + 1);
	}, 120_000);

	// workerType is gone from the core: the flow is rejected at validation, with the migration in the message, before any run exists.
	it('rejects a flow with workerType at run start (WORKER_TYPE_REMOVED) with the migration text: no run, no sandbox', () => {
		const before = sandboxesCreated(world.sbxCalls()).length;
		const file = world.writeFlow('legacy-type', { removedWorkerType: true });

		const started = world.flow(['run', file, '--json']);
		const validated = world.flow(['validate', file]);

		const output = `${started.stdout}${started.stderr}`;
		expect(started.status).not.toBe(0);
		expect(output).not.toMatch(/"executionId"/);
		expect(`${output}${validated.stdout}${validated.stderr}`).toContain('WORKER_TYPE_REMOVED');
		for (const fragment of [
			'workerType was removed',
			'requires: [sandbox]',
			'profile: <name>',
			'flow worker source list',
		]) {
			expect(output).toContain(fragment);
		}
		expect(validated.status).not.toBe(0);
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(before);
	});

	it.each([
		['a typo of a keyword', ['sandbx'], /sandbx[\s\S]*Did you mean[\s\S]*sandbox/],
		[
			'a value of a known key that is not declared',
			['fs=confind'],
			/fs=confind[\s\S]*Did you mean[\s\S]*fs=confined/,
		],
		['a requirement no declared source provides', ['sandbox', 'gpu'], /gpu/],
	])('refuses at run start a flow that requires %s, before anything runs', (_name, requires, message) => {
		const file = world.writeFlow('bad-requires', { requires });

		const started = world.flow(['run', file, '--json']);

		expect(started.status).not.toBe(0);
		expect(`${started.stdout}${started.stderr}`).toMatch(message);
		expect(`${started.stdout}${started.stderr}`).not.toMatch(/"executionId"/);
	});

	it('a flow without requirements never reaches the sandbox source: the step runs on a host worker', async () => {
		// ROUTING FACT PINNED HERE: if this assertion ever fails, the requirement-only rule of the core changed. Update it together with
		// the README section "Routing and isolation" and the plugin declaration steps.
		// The plugin declares guarantees, so the core makes the source requirement-only: it offers its worker only steps whose non-empty
		// requires it fully guarantees, and does not ask the source for a worker for an unbound run: a host worker the daemon forks covers it.
		const callsBefore = world.sbxCalls().length;
		const record = await world.runAndRelease(world.writeFlow('unbound', false), false);

		expect(record.steps?.['probe']?.sourceId).not.toBe('sandbox-1');
		expect(world.sbxCalls()).toHaveLength(callsBefore);
		expect(record.status).toBe('completed');
	}, 120_000);

	// queue.concurrency is 1 by default: a connected requirement-only worker must not take that slot from a run that never uses it.
	it('a connected sandbox worker does not stall an unrelated run: a requirement-less flow and a requires: [sandbox] flow both complete when started together', async () => {
		const bound = world.start(world.writeFlow('together-bound', true));
		const unbound = world.start(world.writeFlow('together-unbound', false));

		const [boundRecord, unboundRecord] = await Promise.all([world.settle(bound), world.settle(unbound)]);

		expect(unboundRecord.status).toBe('completed');
		expect(unboundRecord.steps?.['probe']?.sourceId).not.toBe('sandbox-1');
		expect(boundRecord.status).toBe('completed');
		expect(boundRecord.steps?.['probe']?.sourceId).toBe('sandbox-1');
	}, 150_000);
});

// host: true (design note D4): the sandbox worker serves the step on its own machine. The mock runs no VM, so the proof of
// WHERE it ran is the output (really produced by bash on this machine, not the canned one) and the absence of any sbx call for it.
describe('sandbox plugin, real daemon, sbx mock: host: true script steps', () => {
	const world = new FlowWorld();
	worlds.push(world);

	beforeAll(async () => {
		await world.registerProject();
		world.declareSource('sandbox-host', artifactDirectory, MOCK_SBX_PATH);
		await world.startDaemon();
	}, 150_000);

	it('runs a host-only run on the wrapper machine: real output, no canary of its environment, and no sandbox is created at all', async () => {
		const record = await world.run(world.writeHostFlow('host-only', ['host']));

		const step = record.steps?.['host'];
		expect(record.status).toBe('completed');
		expect(step).toMatchObject({ status: 'completed', sourceId: 'sandbox-host' });
		expect(step?.io?.stdout?.text?.trim()).toBe('ran-on-host canary=absent');
		expect(step?.io?.stdout?.text).not.toContain(CANARY);
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(0);
		expect(world.sbxCalls().filter(call => call.argv[0] === 'exec' && call.argv.includes('-w'))).toHaveLength(0);
	}, 120_000);

	it('in one run, the host step runs on the machine and the unmarked step in the sandbox (canned output), with one sandbox', async () => {
		const record = await world.runAndRelease(world.writeHostFlow('host-and-vm', ['host', 'vm']));

		expect(record.status).toBe('completed');
		expect(record.steps?.['host']?.io?.stdout?.text?.trim()).toBe('ran-on-host canary=absent');
		expect(record.steps?.['vm']?.io?.stdout?.text).toBe(CANNED);
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(1);
		expect(world.log()).toContain('runs on the host (host: true)');
	}, 150_000);
});

// Phase B (implicit confinement): a model step requires the `agent` profile (fs=confined, env=clean) when a configured source guarantees all
// of it, with no opt-out. The mock runs no model: the proof is WHERE the daemon routes the step and what it records, not the model's answer.
describe('sandbox plugin, real daemon, sbx mock: implicit agent confinement of model steps (a daemon WITH the source)', () => {
	const world = new FlowWorld(true);
	worlds.push(world);

	beforeAll(async () => {
		await world.registerProject();
		world.declareSource('sandbox-agent', artifactDirectory, MOCK_SBX_PATH);
		await world.startDaemon();
	}, 150_000);

	it('lands a requirement-less model step in the sandbox and records the implicit agent requirements', async () => {
		const file = world.writeModelFlow('implicit-agent', 1);

		const executionId = world.start(file);
		const record = await world.settle(executionId);

		// Routed to the sandbox source and recorded as implicit: the entries are already in the step's enforced set.
		expect(record.steps?.['ask1']?.sourceId).toBe('sandbox-agent');
		expect(record.requirements?.steps?.['ask1']).toEqual(expect.arrayContaining(['env=clean', 'fs=confined']));
		expect(record.requirements?.implicit).toEqual({ requires: ['env=clean', 'fs=confined'], steps: ['ask1'] });
		expect(sandboxesCreated(world.sbxCalls()).length).toBeGreaterThan(0);
	}, 150_000);

	// codex and opencode steps are plain prompts in the sandbox. The mock model CLIs of the engine run INSIDE the sbx mock, so the whole chain is
	// exercised: provider -> tool-aware preparation -> translator -> sandbox exec. The mocks echo what they were given.
	it('runs a codex step and an opencode step as plain prompts: their own store and credentials in the environment, no host path, no injected MCP server', async () => {
		const file = world.writeToolFlow('tools-plain', [
			{ provider: 'codex', model: 'openai.gpt-5.6-terra', prompt: 'echo_env:CODEX_HOME' },
			{ provider: 'codex', model: 'openai.gpt-5.6-terra', prompt: 'echo_env:AWS_CONFIG_FILE' },
			{ provider: 'opencode', model: 'amazon-bedrock/example', prompt: 'echo_xdg' },
			{ provider: 'opencode', model: 'amazon-bedrock/example', prompt: 'echo_config' },
		]);

		const record = await world.runAndRelease(file);

		const answer = (id: string): string => JSON.stringify(record.steps?.[id] ?? {});
		expect(record.steps?.['ask1']?.sourceId).toBe('sandbox-agent');
		expect(record.status, JSON.stringify(record.steps)).toBe('completed');
		expect(answer('ask1')).toMatch(/CODEX_HOME=[^"\\]*sessions\/codex/);
		expect(answer('ask2')).toContain('AWS_CONFIG_FILE=/home/agent/.flow-credentials/aws-config');
		// opencode: the isolated XDG_CONFIG_HOME of the engine (a host temp directory) is not forwarded, and there is no inline config (no MCP server, no hook).
		expect(answer('ask3')).toContain('XDG_CONFIG_HOME:not-set');
		expect(answer('ask4')).toContain('OPENCODE_CONFIG:no-config');
		const rules = world
			.sbxCalls()
			.filter(call => call.argv[0] === 'policy' && call.argv[1] === 'allow')
			.map(call => call.argv.join(' '));
		expect(rules.some(rule => rule.includes('bedrock-mantle'))).toBe(true);
	}, 150_000);

	it('refuses at run start a model step whose workspace the source does not accept (in-place): actionable message, no unconfined fallback', () => {
		const createsBefore = sandboxesCreated(world.sbxCalls()).length;

		const started = world.flow(['run', world.writeModelFlow('implicit-in-place', 1, 'in-place'), '--json']);

		const output = `${started.stdout}${started.stderr}`;
		expect(started.status).not.toBe(0);
		expect(output).toContain('WORKSPACE_KIND_NOT_ACCEPTED');
		expect(output).toMatch(/in-place[\s\S]*pool|pool[\s\S]*in-place/);
		expect(output).not.toMatch(/"executionId"/);
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(createsBefore);
	});

	it('prints no unconfined warning when the source covers the set (a daemon with the source)', () => {
		const started = world.flow(['run', world.writeModelFlow('implicit-covered', 1)]);
		const executionId = started.stdout.trim();

		expect(started.stderr).not.toContain('runs unconfined');
		world.flow(['cancel', executionId]);
	});

	it('a script step without requirements still never reaches the sandbox source (the daemon has it, a model flow exists)', async () => {
		const createsBefore = sandboxesCreated(world.sbxCalls()).length;

		const record = await world.runAndRelease(world.writeFlow('implicit-script-only', false), false);

		expect(record.status).toBe('completed');
		expect(record.steps?.['probe']?.sourceId).not.toBe('sandbox-agent');
		expect(record.requirements?.implicit).toBeUndefined();
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(createsBefore);
	}, 120_000);

	// The listing is what a user reads to see what the source gives; captured into the README.
	it('prints the guarantees and the workspace kinds of the source in `flow worker source list`', () => {
		const listed = world.flow(['worker', 'source', 'list']);

		expect(listed.status).toBe(0);
		expect(listed.stdout).toMatch(/sandbox-agent[^\n]*guarantees=[^\n]*sandbox/);
		expect(listed.stdout).toMatch(/sandbox-agent[^\n]*workspaces=pool/);
		expect(listed.stdout).toContain('requirement-only');
		for (const guarantee of ['clean=run', 'env=clean', 'fs=confined', 'ports=private', 'sandbox']) {
			expect(listed.stdout).toContain(guarantee);
		}
	});
});

// flow refuses an unknown --option when the source is declared (core 0ad2cee6 reads the names from the plugin manifest): a misspelt `projects` is not stored
// (it would be read as a source that serves every project).
describe('sandbox plugin, real flow CLI: a misspelt option is refused when the source is declared', () => {
	const world = new FlowWorld();
	worlds.push(world);

	it('refuses --option project=<id> with the nearest name (projects), exit 1, and stores nothing', async () => {
		await world.registerProject();

		const refused = world.flow([
			'worker',
			'source',
			'add',
			'sandbox-typo',
			'--provider',
			'sandbox',
			'--plugin',
			'sandbox.exec',
			'--plugins-dir',
			artifactDirectory,
			'--option',
			`project=${world.projectId}`,
			'--option',
			'region=us-east-1',
			'--option',
			'profiles=claude=mock-profile',
		]);

		expect(refused.status).toBe(1);
		expect(`${refused.stdout}${refused.stderr}`).toMatch(/project[\s\S]*Did you mean[\s\S]*projects/i);
		expect(world.flow(['worker', 'source', 'list']).stdout).not.toContain('sandbox-typo');
	}, 120_000);
});

// Implicit confinement is PER PROJECT (core cb097f7f): a source covers a run only if its declared entry lists the run's project (--option projects=...).
describe('sandbox plugin, real daemon, sbx mock: implicit confinement only for the projects the source serves', () => {
	const world = new FlowWorld(true);
	worlds.push(world);
	let other: { id: string; directory: string };

	beforeAll(async () => {
		await world.registerProject();
		other = await world.registerOtherProject('project-b');
		// The source is declared for project A only.
		world.declareSource('sandbox-a', artifactDirectory, MOCK_SBX_PATH, world.projectId);
		await world.startDaemon();
	}, 150_000);

	it('confines a model step of the project the source serves: routed to it, implicit requirements recorded', async () => {
		const record = await world.runAndRelease(world.writeModelFlow('scoped-a', 1));

		expect(record.steps?.['ask1']?.sourceId).toBe('sandbox-a');
		expect(record.requirements?.implicit).toEqual({ requires: ['env=clean', 'fs=confined'], steps: ['ask1'] });
	}, 150_000);

	it('does not route a model step of ANOTHER project to it: one warning naming the source that serves other projects, no implicit requirements', () => {
		const file = world.writeModelFlow('scoped-b', 1, 'pool', other.directory);

		const started = world.flow(['run', file], 120_000, other.directory);
		const executionId = started.stdout.trim();

		expect(started.status, started.stderr).toBe(0);
		const warnings = started.stderr.split(/\r?\n/).filter(line => line.includes('runs unconfined'));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/^Warning: model step ask1 runs unconfined: no worker source serving project/);
		expect(warnings[0]).toContain('sandbox-a');
		expect(warnings[0]).toMatch(/serves other projects/);
		const shown = JSON.parse(
			world.flow(['show', executionId, '--json'], 120_000, other.directory).stdout
		) as ExecutionRecord;
		expect(shown.requirements?.implicit).toBeUndefined();
		// Cancelled at once: no model is started on a host worker by this test.
		world.flow(['cancel', executionId], 120_000, other.directory);
		expect(sandboxesCreated(world.sbxCalls()).length).toBeGreaterThanOrEqual(1);
	});
});

// The core decides from the STATIC manifest list: a source covering only part of the agent profile does not count (no half confinement).
describe('sandbox plugin, real daemon: a source that guarantees only part of the agent profile', () => {
	const world = new FlowWorld(true);
	worlds.push(world);

	beforeAll(async () => {
		// A copy of the built artifact whose manifest and instance declare fs=confined and sandbox but NOT env=clean.
		const partial = path.join(world.root, 'partial-plugin');
		fs.cpSync(artifactDirectory, partial, { recursive: true });
		const config = path.join(partial, 'plugin-sandbox', 'plugin.config.js');
		const original = fs.readFileSync(config, 'utf8');
		// The list is one declaration in the artifact (formatted on one or several lines): replace the whole of it.
		const listing = /const GUARANTEES = Object\.freeze\(\[[^\]]*\]\);/;
		if (!listing.test(original))
			throw new Error('the guarantees list of the artifact was not found: update this test');
		fs.writeFileSync(
			config,
			original.replace(listing, () => "const GUARANTEES = Object.freeze(['fs=confined', 'sandbox']);")
		);
		await world.registerProject();
		world.declareSource('sandbox-partial', partial, MOCK_SBX_PATH);
		await world.startDaemon();
	}, 150_000);

	it('does not count it: the model step runs as before, with the unconfined warning, and no implicit set is recorded', async () => {
		const started = world.flow(['run', world.writeModelFlow('partial', 1)]);
		const executionId = started.stdout.trim();

		expect(started.stderr).toMatch(/Warning: model step ask1 runs unconfined: no worker source guarantees/);
		const shown = JSON.parse(world.flow(['show', executionId, '--json']).stdout) as ExecutionRecord;
		expect(shown.requirements?.implicit).toBeUndefined();
		world.flow(['cancel', executionId]);
		expect(sandboxesCreated(world.sbxCalls())).toHaveLength(0);
	});
});

describe('sandbox plugin, real daemon: model steps on a daemon WITHOUT the sandbox source', () => {
	const world = new FlowWorld(true);
	worlds.push(world);

	beforeAll(async () => {
		await world.registerProject();
		await world.startDaemon();
	}, 150_000);

	it('routes as before and prints one stderr warning per model step', () => {
		const started = world.flow(['run', world.writeModelFlow('unconfined-two', 2)]);
		const executionId = started.stdout.trim();

		const warnings = started.stderr.split(/\r?\n/).filter(line => line.includes('runs unconfined'));
		expect(started.status).toBe(0);
		expect(warnings).toHaveLength(2);
		expect(warnings[0]).toMatch(/^Warning: model step ask1 runs unconfined: no worker source guarantees/);
		expect(warnings[1]).toMatch(/model step ask2 runs unconfined: no worker source guarantees/);
		expect(started.stderr).toContain('flow worker source list');
		expect(started.stderr).toContain('profile: agent');
		// Cancelled at once: the e2e must not wait for a host worker to start a model.
		world.flow(['cancel', executionId]);
	});

	it('records no implicit requirements when no source covers the set', async () => {
		const started = world.flow(['run', world.writeModelFlow('unconfined-record', 1), '--json']);
		const executionId = (/"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout) ?? [])[1] as string;
		world.flow(['cancel', executionId]);

		const shown = JSON.parse(world.flow(['show', executionId, '--json']).stdout) as ExecutionRecord;

		expect(shown.requirements?.implicit).toBeUndefined();
	});
});

describe('sandbox plugin, real daemon, sbx mock: a source that cannot start', () => {
	it('fails the bound step with the daemon contact-error message, not with plugin text, within the bound', async () => {
		const world = new FlowWorld();
		worlds.push(world);
		await world.registerProject();
		world.declareSource('sandbox-broken', artifactDirectory, path.join(world.root, 'no-such-sbx.exe'));
		await world.startDaemon();

		const started = Date.now();
		const record = await world.run(world.writeFlow('bound-broken', true), 60_000);

		const error = record.steps?.['probe']?.error ?? '';
		expect(record.status).toBe('failed');
		expect(error).toContain('Last contact with source "sandbox-broken" failed at');
		// The text of the plugin's own error is third-party text: it goes to the daemon log, never into the step message.
		expect(error).not.toContain('sbxPath');
		expect(world.log()).toContain('sbxPath');
		expect(Date.now() - started).toBeLessThan(45_000);
	}, 120_000);
});
