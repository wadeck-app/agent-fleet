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
 *   step's exec, then `rm --force` at the end of the run, while the mounted directories still exist (the daemon releases the
 *   workspace only after the ack, which follows the removal: the log order shows it);
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
	readonly daemonLog = path.join(this.root, 'daemon.log');
	readonly env: NodeJS.ProcessEnv;
	projectId = '';
	daemon: ChildProcess | undefined;

	constructor() {
		fs.mkdirSync(this.projectDirectory, { recursive: true });
		fs.mkdirSync(this.mockState, { recursive: true });
		this.env = {
			...this.isolation.env,
			SBX_MOCK_STATE_DIR: this.mockState,
			SBX_MOCK_SCENARIO: 'bash-canned',
			SBX_MOCK_BASH_STDOUT: CANNED,
			// A daemon with nothing to do stops after its idle check: keep it for the whole test.
			FLOW_DAEMON_IDLE_CHECK_MS: '600000',
		};
		delete this.env['SBX_MOCK_PATH'];
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
	writeFlow(name: string, workerType: boolean): string {
		const file = path.join(this.projectDirectory, `${name}.yml`);
		fs.writeFileSync(
			file,
			[
				`id: ${name}`,
				"version: '1.0.0'",
				`name: ${name}`,
				'description: One script step.',
				...(workerType ? ['workerType: sandbox'] : []),
				'workspace:',
				'    mode: shared',
				'    gitStrategy: any',
				'    reusePolicy: if-available',
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
	 * Runs a flow, then waits until the daemon has released its workspace: that happens after the end-of-run notice, the wrapper's
	 * removal of the sandbox and its ack, so everything the tests look at afterwards (sbx calls, log lines) exists.
	 */
	async runAndRelease(file: string): Promise<ExecutionRecord> {
		const released = (): number => this.log().split('Released workspace').length - 1;
		const before = released();
		const record = await this.run(file);
		await waitFor('the daemon to release the run workspace', 40_000, () => released() > before || undefined);
		return record;
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
		// Exactly the two mounts: the run workspace and its .meta, both below the project's .flow/workspaces.
		const mounts = create?.argv.slice(8) ?? [];
		expect(mounts).toHaveLength(2);
		expect(mounts[1]).toBe(`${mounts[0]}.meta`);
		expect(mounts[0]).toContain(path.join('.flow', 'workspaces'));
		expect(verbs.indexOf('create')).toBe(0);
		expect(stepExec).toBeGreaterThan(0);
		expect(removal).toBeGreaterThan(stepExec);
		expect(named[removal]?.argv).toEqual(['rm', '--force', sandbox]);
	});

	it('removes the sandbox BEFORE the daemon releases the run workspace (ack after removal)', () => {
		const calls = world.sbxCalls();
		const [sandbox] = sandboxesCreated(calls);
		const removal = calls.find(call => call.argv[0] === 'rm' && call.argv.includes(sandbox as string));
		const log = world.log();

		// Still mounted when rm arrived: the directories existed on the host at that instant.
		expect(Object.values(removal?.mountsExistAtRm ?? {})).toEqual([true, true]);
		const removed = log.indexOf(`Sandbox "${sandbox}" removed`);
		const released = log.indexOf('Released workspace');
		expect(removed).toBeGreaterThan(-1);
		expect(released).toBeGreaterThan(removed);
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

	it('an unbound flow is kept off the sandbox worker: its type is exclusive, the step runs on a host worker', async () => {
		// The plugin declares `exclusive: true`, so the daemon offers its worker only to runs bound with `workerType: sandbox` and does
		// not ask the source for a worker for an unbound run: the demand is covered by a host worker the daemon forks.
		const callsBefore = world.sbxCalls().length;
		const record = await world.runAndRelease(world.writeFlow('unbound', false));

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
