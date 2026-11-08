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
 * - a run bound with `workerType: sandbox` is served by that worker (the execution record names the source and the step output);
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
const BOUND_WAIT_SECONDS = 6;

interface ExecutionRecord {
	status?: string;
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

	constructor() {
		fs.mkdirSync(this.projectDirectory, { recursive: true });
		fs.mkdirSync(this.mockState, { recursive: true });
		fs.mkdirSync(path.join(this.poolDirectory, 'slot-1'), { recursive: true });
		this.env = {
			...this.isolation.env,
			SBX_MOCK_STATE_DIR: this.mockState,
			SBX_MOCK_SCENARIO: 'bash-canned',
			SBX_MOCK_BASH_STDOUT: CANNED,
			// A daemon with nothing to do stops after its idle check: keep it for the whole test.
			FLOW_DAEMON_IDLE_CHECK_MS: '600000',
			// The OS picks the daemon port: the user's own daemon (standard range) is never probed or competed with.
			FLOW_DAEMON_PORT: '0',
		};
		delete this.env['SBX_MOCK_PATH'];
		DaemonIsolationGuard.assert({ env: this.env, isolatedRoot: this.root });
		fs.writeFileSync(
			path.join(this.isolation.configDir, 'config.yml'),
			`worker:\n  boundStepWaitSeconds: ${BOUND_WAIT_SECONDS}\n`
		);
	}

	flow(args: string[], timeoutMs = 120_000): { status: number | null; stdout: string; stderr: string } {
		const result = spawnSync(process.execPath, ['--import', tsxUrl, flowIndex, ...args], {
			env: this.env,
			cwd: this.projectDirectory,
			encoding: 'utf8',
			timeout: timeoutMs,
			windowsHide: true,
		});
		return { status: result.status, stdout: result.stdout, stderr: result.stderr };
	}

	async registerProject(): Promise<void> {
		const registry = path.join(String(this.env['XDG_CONFIG_HOME']), 'project');
		this.projectId = (await addProject(registry, { name: 'e2e', path: this.projectDirectory })).id;
	}

	declareSource(sourceId: string, pluginsDirectory: string, sbxPath: string): void {
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
			`projects=${this.projectId}`,
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
		await waitFor('the daemon to publish worker.port', 60_000, () =>
			fs.existsSync(path.join(this.isolation.configDir, 'worker.port'))
		);
	}

	/** One script step; `workerType` binds the run. */
	writeFlow(name: string, workerType: boolean, workspace: 'pool' | 'in-place' = 'pool'): string {
		const file = path.join(this.projectDirectory, `${name}.yml`);
		fs.writeFileSync(
			file,
			[
				`id: ${name}`,
				"version: '1.0.0'",
				`name: ${name}`,
				'description: One script step.',
				...(workerType ? ['workerType: sandbox'] : []),
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

	/** Runs a flow and waits until its execution settles. */
	async run(file: string, timeoutMs = 90_000): Promise<ExecutionRecord> {
		const started = this.flow(['run', file, '--json']);
		const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
		if (match === null) throw new Error(`no executionId from flow run: ${started.stdout}${started.stderr}`);
		const executionId = match[1] as string;
		return waitFor(`execution ${executionId} to settle`, timeoutMs, () => {
			const shown = this.flow(['show', executionId, '--json']);
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
	async runAndRelease(file: string, removesASandbox = true): Promise<ExecutionRecord> {
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
		if (!removesASandbox) {
			claimWatch.stop();
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
		try {
			await waitFor(
				`the daemon to release the pool slot (${this.claimFolder} to disappear after the wrapper's ack)`,
				30_000,
				() => watch.goneAt()
			);
		} catch (error) {
			const calls = this.sbxCalls().map(call => call.argv.slice(0, 2).join(' '));
			throw new Error(
				`${String(error)}. The wrapper removes the sandbox, then acknowledges the end of the run; if the claim never goes, the ack did not arrive.\nsbx calls:\n${calls.join('\n')}\ndaemon log (tail):\n${this.log().slice(-3000)}`
			);
		} finally {
			watch.stop();
		}
		this.releases.push({ seenAt: watch.seenAt(), goneAt: watch.goneAt() as number });
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

	/** Stops the daemon THIS world started (never another one); its wrapper leaves when the connection closes. */
	async stop(): Promise<void> {
		const daemon = this.daemon;
		if (daemon?.pid !== undefined && daemon.exitCode === null) {
			this.flow(['stop'], 30_000);
			await waitFor('the daemon to exit', 15_000, () => daemon.exitCode !== null || undefined).catch(
				() => undefined
			);
			if (daemon.exitCode === null) daemon.kill();
		}
		await new Promise(resolve => setTimeout(resolve, 300));
		this.isolation.cleanup();
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

afterAll(async () => {
	for (const world of worlds) await world.stop();
	fs.rmSync(artifactRoot, { recursive: true, force: true });
});

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

	it('refuses an in-place workspace for a bound run, in plain words, and starts no sandbox', async () => {
		const callsBefore = world.sbxCalls().filter(call => call.argv[0] === 'create').length;

		const record = await world.run(world.writeFlow('in-place', true, 'in-place'));

		expect(record.status).toBe('failed');
		expect(world.log()).toContain(
			'needs workspace: pool, the in-place workspace exposes <project>/.flow and .git/hooks to the sandbox'
		);
		expect(world.sbxCalls().filter(call => call.argv[0] === 'create')).toHaveLength(callsBefore);
	}, 120_000);

	it('an unbound flow is kept off the sandbox worker: its type is exclusive, the step runs on a host worker', async () => {
		// ROUTING FACT PINNED HERE: if this assertion ever fails, the exclusivity of the sandbox type changed. Update it together with
		// the README section "Routing and isolation" (the paragraph on the exclusive worker type) and the plugin declaration steps.
		// The plugin declares `exclusive: true`, so the daemon offers its worker only to runs bound with `workerType: sandbox` and does
		// not ask the source for a worker for an unbound run: the demand is covered by a host worker the daemon forks.
		const callsBefore = world.sbxCalls().length;
		const record = await world.runAndRelease(world.writeFlow('unbound', false), false);

		expect(record.steps?.['probe']?.sourceId).not.toBe('sandbox-1');
		expect(world.sbxCalls()).toHaveLength(callsBefore);
		expect(record.status).toBe('completed');
	}, 120_000);
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
