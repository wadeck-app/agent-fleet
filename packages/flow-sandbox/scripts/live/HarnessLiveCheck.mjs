#!/usr/bin/env node

/**
 * GATED live acceptance of milestone M4 (the relay development harness). Never part of `npm test`, `npm run check`
 * or CI. It makes real Bedrock calls (one word), creates ONE real sandbox and starts a real (isolated) flow daemon.
 *
 * Routing here is by LABELS (`labels: [sandbox]`, a `built-in:command` source), which does NOT isolate against steps a
 * model injects (they carry no labels). The strict form, `requires: [sandbox]` in the flow with a source declared by
 * `--plugin sandbox.<impl>`, needs the sandbox plugin (`npm run bundle --workspace flow-sandbox`), which this script does not declare yet (a plugin live check is a separate task): adding
 * `requires` to its flow alone would make every step wait for a source that declares the guarantee and fail.
 *
 * What it does:
 *  1. builds an ISOLATED flow environment (own FLOW_CONFIG_DIR / XDG_CONFIG_HOME / npm config, see
 *     flow-cli `createIsolatedCliEnv`), registers a throw-away project in the isolated project registry, and declares
 *     a `built-in:command` worker source (`--labels sandbox`) that starts scripts/HarnessWrapper.mjs;
 *  2. starts a daemon of THIS checkout (tsx, FLOW_DAEMON_MODE=1) as a child of this script, in that environment;
 *  3. runs a flow (`labels: [sandbox]`): a script step that writes a file under outputs and a model step (one word);
 *  4. asserts the outcome (see the PASS lines), then stops the daemon, waits for the wrapper to exit, removes the
 *     sandbox it created and the temporary tree.
 * The real flow daemon and its configuration are never touched: every spawned process gets the isolated environment.
 *
 * Usage (repository root):
 *   SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/HarnessLiveCheck.mjs
 * Env:
 *   SBX_LIVE=1             required.
 *   HARNESS_IMAGE          sandbox image, default flow-sandbox:m4 (build: BuildInnerBundles.mjs, then image/build-image.mjs --tag flow-sandbox:m4).
 *   HARNESS_PROFILE        host AWS profile, default AWS_PROFILE.
 *   HARNESS_REGION         default: `aws configure get region --profile <profile>`.
 *   HARNESS_OUTPUT         JSON evidence file, default .claude/temp/m4/live-results.json.
 *   HARNESS_PARK=0         no parked last step: the flow itself COMPLETES, and the daemon (which stops about a second after its
 *                          last work) ends the run for the wrapper, which stops the sandbox through daemon_stopping. Default 1:
 *                          a never-served last step keeps the run, and so the daemon, alive long enough to watch the wrapper idle
 *                          timer (12 s) stop the sandbox. The sandbox wrapper has no run-end event yet, so these are the two
 *                          ways a harness sandbox gets stopped.
 *   HARNESS_KEEP=1         keep the temporary tree and the sandbox for inspection (nothing is cleaned; you remove them).
 *   ANTHROPIC_DEFAULT_SONNET_MODEL  copied to the model steps when set.
 *
 * Exit code: 0 all assertions passed, 1 an assertion failed, 2 refused to run.
 */
import { addProject } from '@wadeck-app/project-sdk';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createIsolatedCliEnv } from '../../../flow-cli/src/test-utils/IsolatedCliEnv.ts';
import { AwsCredentialExporter } from '../../src/AwsCredentialExporter.ts';
import { HostEnvironment } from '../../src/HostEnvironment.ts';
import { DaemonIsolationGuard } from '../../src/testing/DaemonIsolationGuard.ts';
import { LeftoverSandboxes } from '../../src/LeftoverSandboxes.ts';
import { NodeCommandRunner } from '../../src/NodeCommandRunner.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';
import { SystemClock } from '../../src/SystemClock.ts';
import { WrapperPresence } from '../../src/WrapperPresence.ts';

function refuse(message) {
	console.error(`HarnessLiveCheck refused to run: ${message}`);
	process.exit(2);
}

if (process.env.SBX_LIVE !== '1') {
	refuse(
		'set SBX_LIVE=1 to confirm that you want to create a real sandbox, start a daemon and make real Bedrock calls.'
	);
}
if (process.env.SBX_MOCK_PATH) refuse('SBX_MOCK_PATH is set, so the result would not be live. Unset it.');

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '..', '..', '..', '..');
const flowIndex = path.join(repositoryRoot, 'packages', 'flow-cli', 'src', 'cli', 'FlowIndex.ts');
const wrapperScript = path.join(repositoryRoot, 'packages', 'flow-sandbox', 'scripts', 'HarnessWrapper.mjs');
const tsxUrl = import.meta.resolve('tsx');
const image = process.env.HARNESS_IMAGE ?? 'flow-sandbox:m4';
const hostProfile = process.env.HARNESS_PROFILE ?? process.env.AWS_PROFILE;
if (!hostProfile) refuse('no host AWS profile: set HARNESS_PROFILE or AWS_PROFILE.');
const keep = process.env.HARNESS_KEEP === '1';
const park = process.env.HARNESS_PARK !== '0';
const outputFile =
	process.env.HARNESS_OUTPUT ?? path.join(repositoryRoot, '.claude', 'temp', 'm4', 'live-results.json');
const realSbx = path.join(process.env.LOCALAPPDATA ?? '', 'DockerSandboxes', 'bin', 'sbx.exe');
const sbxPath = process.env.SBX_PATH ?? (fs.existsSync(realSbx) ? realSbx : undefined);

const forward = value => value.replaceAll('\\', '/');
const evidence = { startedAt: new Date().toISOString(), image, hostProfile, notes: [], timings: {} };
const results = [];
const created = { sandbox: undefined };
let daemon;

async function awsText(args) {
	const result = await new NodeCommandRunner().run({ command: 'aws', args, timeoutMs: 30_000 });
	if (result.exitCode !== 0) throw new Error(`aws ${args.join(' ')} failed: ${result.stderr.trim()}`);
	return result.stdout.trim();
}
const region = process.env.HARNESS_REGION ?? (await awsText(['configure', 'get', 'region', '--profile', hostProfile]));
if (!region) refuse('no AWS region: set HARNESS_REGION or configure one for the profile.');

// ---- isolated environment ----
// createIsolatedCliEnv redirects HOME, USERPROFILE, APPDATA, LOCALAPPDATA and the app-core registration too, and they STAY
// isolated for the daemon: a daemon given the real ones registered this clone's app-modules with the user's real app-core
// (incident 2026-11-08). The wrapper's own sbx and aws children need the REAL sbx login and AWS SSO session: the real
// directories travel in FLOW_SANDBOX_HOST_* and come back only for those children (HostEnvironment). The daemon port is
// chosen by the OS, so the user's own daemon (standard range) is never probed or competed with.
const isolation = createIsolatedCliEnv();
const root = fs.realpathSync.native(isolation.root);
const environment = {
	...HostEnvironment.isolate(isolation.env),
	FLOW_DAEMON_PORT: '0',
	...(sbxPath ? { SBX_PATH: sbxPath } : {}),
	// Parked run: the run itself keeps the daemon alive. HARNESS_PARK=0 lets the flow complete and relies on the idle stop (daemon_stopping),
	// so the variable is set only when parked; the periodic check stays long either way.
	FLOW_DAEMON_IDLE_CHECK_MS: '600000',
	...(park ? { FLOW_DAEMON_NO_IDLE_STOP: '1' } : {}),
	AWS_PROFILE: hostProfile,
};
delete environment.SBX_MOCK_PATH;
// Nothing of the daemon may reach the real user state: refuse to go on otherwise.
DaemonIsolationGuard.assert({ env: environment, isolatedRoot: root });
const configDirectory = isolation.configDir;
const registryDirectory = path.join(environment.XDG_CONFIG_HOME, 'project');
const projectDirectory = path.join(root, 'project');
// The pool of the flow: one prepared folder (plain, outside the project), the workspace of the run.
const poolDirectory = path.join(root, 'pool');
const wrapperLog = path.join(root, 'wrapper.log');
const daemonLog = path.join(root, 'daemon.log');
const presenceDirectory = path.join(root, 'presence');
const wrapperId = `hl${randomBytes(2).toString('hex')}`;

if (path.resolve(configDirectory).toLowerCase() === path.resolve(os.homedir(), '.config', 'flow').toLowerCase()) {
	refuse(`the isolated config dir ${configDirectory} equals the real flow config dir.`);
}

function flow(args, options = {}) {
	return spawnSync(process.execPath, ['--import', tsxUrl, flowIndex, ...args], {
		env: environment,
		cwd: options.cwd ?? projectDirectory,
		encoding: 'utf8',
		timeout: options.timeoutMs ?? 120_000,
		windowsHide: true,
	});
}

async function step(name, action) {
	const started = Date.now();
	try {
		const detail = await action();
		results.push({ name, ok: true });
		console.log(`PASS  ${name} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ''}`);
	} catch (error) {
		results.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) });
		console.log(`FAIL  ${name} (${Date.now() - started} ms)`);
		console.log(`      ${error instanceof Error ? error.message : String(error)}`);
	}
}

function expect(condition, message) {
	if (!condition) throw new Error(message);
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function waitFor(description, timeoutMs, probe) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${description}`);
		await sleep(500);
	}
}

function readIfExists(file) {
	return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

const runtime = new SbxCliRuntime(sbxPath ? { binaryPath: sbxPath } : undefined);

const PARKED_STEP = `
    # No worker has this label, so the step stays queued: the run (and therefore the daemon, which stops about a
    # second after its last work) stays alive, which lets the harness's own idle timer fire.
    - id: parked
      name: Never runs (keeps the run open)
      type: script
      shell: bash
      labels:
          - parked
      depends:
          - ask
      script: echo never
`;

function flowFile(directory) {
	const file = path.join(directory, 'sandbox-harness-check.yml');
	fs.writeFileSync(
		file,
		`id: sandbox-harness-check
version: '1.0.0'
name: Sandbox harness check
description: A script step and a model step that must run inside a sandbox.

labels:
    - sandbox

# A sandboxed worker accepts only a pool: the in-place workspace would expose <project>/.flow and .git/hooks to the sandbox.
workspace: { provider: pool, dir: '${poolDirectory.replaceAll('\\', '/')}', prefix: slot-, count: 1 }

steps:
    - id: probe
      name: Probe the VM
      type: script
      shell: bash
      script: |
          echo "hostname=$(hostname)"
          echo "user=$(id -un)"
          echo "kernel=$(uname -sr)"
          echo "pwd=$(pwd)"
          echo "aws_names=$(env | grep -E '^(AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_ACCESS_KEY_ID)=' | cut -d= -f1 | tr '\\n' ',')"
          echo "bridge_token_in_env=$(env | grep -c '^FLOW_BRIDGE_TOKEN=')"
      output:
          report:
              type: string
              from: stdout
              writeOutput: probe.txt

    - id: forge
      name: Try to open the bridge from inside
      type: script
      shell: bash
      depends:
          - probe
      script: |
          cat > forge.mjs <<'JS'
          import { readdirSync, readFileSync } from 'node:fs';
          const nul = String.fromCharCode(0);
          let placeholder;
          let bridge;
          for (const pid of readdirSync('/proc').filter(name => /^[0-9]+$/.test(name))) {
            try {
              const entries = readFileSync('/proc/' + pid + '/environ', 'latin1').split(nul);
              placeholder ??= entries.find(entry => entry.startsWith('FLOW_BRIDGE_TOKEN='))?.slice(18);
              bridge ??= entries.find(entry => entry.startsWith('FLOW_BRIDGE_URL='))?.slice(16);
            } catch {
              // another user's process
            }
          }
          console.log('placeholder_visible_in_vm=' + (placeholder !== undefined));
          console.log('bridge_url_visible_in_vm=' + (bridge !== undefined));
          const attempt = (label, headers) =>
            new Promise(resolve => {
              const socket = new WebSocket(bridge, { headers });
              const timer = setTimeout(() => resolve(label + '=timeout'), 8000);
              socket.addEventListener('open', () => {
                clearTimeout(timer);
                resolve(label + '=OPEN');
                socket.close();
              });
              socket.addEventListener('error', () => {
                clearTimeout(timer);
                resolve(label + '=refused');
              });
            });
          if (bridge !== undefined) {
            console.log(await attempt('no_token', {}));
            console.log(await attempt('wrong_token', { 'x-flow-bridge-token': 'flow-ph-0000000000000000000000000000000000' }));
            if (placeholder !== undefined) {
              console.log(await attempt('placeholder_second_connection', { 'x-flow-bridge-token': placeholder }));
            }
          }
          JS
          node forge.mjs
      output:
          report:
              type: string
              from: stdout
              writeOutput: forge.txt

    - id: again
      name: Probe the warm VM again (same script as probe, for the comparison with the host)
      type: script
      shell: bash
      depends:
          - forge
      script: |
          echo "hostname=$(hostname)"
          echo "user=$(id -un)"
          echo "kernel=$(uname -sr)"
          echo "pwd=$(pwd)"

    - id: ask
      name: One word
      type: model
      model: sonnet
      depends:
          - again
      prompt: |
          Reply with the single word OK and nothing else.
      output:
          answer:
              type: string
              from: last_message
${park ? PARKED_STEP : ''}
`
	);
	return file;
}

try {
	console.log(`isolated root: ${root}`);
	console.log(`isolated flow config dir: ${configDirectory}`);

	fs.mkdirSync(projectDirectory, { recursive: true });
	fs.mkdirSync(path.join(poolDirectory, 'slot-1'), { recursive: true });
	fs.mkdirSync(presenceDirectory, { recursive: true });
	const project = await addProject(registryDirectory, { name: `harness-${wrapperId}`, path: projectDirectory });
	evidence.projectId = project.id;

	const sourceArguments = [
		`--import=${tsxUrl}`,
		forward(wrapperScript),
		'--wrapper-id',
		wrapperId,
		'--project-id',
		project.id,
		'--project-path',
		forward(projectDirectory),
		'--profile',
		`claude=${hostProfile}`,
		'--region',
		region,
		'--image',
		image,
		'--pull',
		'never',
		'--idle-minutes',
		'0.2',
		// sbx's own default (a machine-wide setting this check never changes); the harness refuses to start without it.
		'--accept-ssh-agent-forwarding',
		'--presence-dir',
		forward(presenceDirectory),
		'--log-file',
		forward(wrapperLog),
		...(process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
			? ['--model-env', `ANTHROPIC_DEFAULT_SONNET_MODEL=${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL}`]
			: []),
	];

	await step('declare the built-in:command source with --labels sandbox', () => {
		const declared = flow([
			'worker',
			'source',
			'add',
			'sbx',
			'--provider',
			'built-in:command',
			'--labels',
			'sandbox',
			'--max-workers',
			'1',
			'--cwd',
			forward(repositoryRoot),
			'--command',
			'node',
			...sourceArguments.map(value => `--arg=${value}`),
		]);
		expect(declared.status === 0, `exit ${declared.status}: ${declared.stderr}${declared.stdout}`);
		expect(
			fs.existsSync(path.join(configDirectory, 'worker-sources.json')),
			'worker-sources.json was not written in the isolated config dir'
		);
		return 'source "sbx" declared in the isolated config dir';
	});

	const flowPath = flowFile(projectDirectory);
	await step('validate the flow with the repo validator', () => {
		const validation = flow(['validate', flowPath]);
		expect(validation.status === 0, `exit ${validation.status}: ${validation.stderr}${validation.stdout}`);
		return validation.stdout.trim().split('\n').at(-1);
	});

	await step('start an isolated daemon of this checkout', async () => {
		const log = fs.openSync(daemonLog, 'a');
		daemon = spawn(process.execPath, ['--import', tsxUrl, flowIndex], {
			env: { ...environment, FLOW_DAEMON_MODE: '1' },
			cwd: repositoryRoot,
			stdio: ['ignore', log, log],
			windowsHide: true,
		});
		await waitFor('the daemon to publish worker.port in the isolated dir', 60_000, () =>
			fs.existsSync(path.join(configDirectory, 'worker.port'))
		);
		evidence.daemonPid = daemon.pid;
		return `pid ${daemon.pid}`;
	});

	let executionId;
	await step(
		'run the flow; the daemon launches the harness; probe, forge, again and ask complete in the sandbox',
		async () => {
			const started = Date.now();
			const run = flow(['run', flowPath, '--json'], { timeoutMs: 120_000 });
			evidence.runOutput = `${run.stdout}${run.stderr}`.slice(0, 4000);
			const match = /"executionId"\s*:\s*"([^"]+)"/.exec(run.stdout);
			expect(match !== null, `no executionId in the output of flow run: ${evidence.runOutput}`);
			executionId = match[1];
			const work = ['probe', 'forge', 'again', 'ask'];
			const settled = record =>
				park
					? work.every(id => ['completed', 'failed'].includes(record?.steps?.[id]?.status))
					: ['completed', 'failed'].includes(record?.status);
			const record = await waitFor(
				'the four steps to settle (the parked step stays queued by design)',
				300_000,
				() => {
					const shown = flow(['show', executionId, '--json']);
					if (shown.status !== 0) return undefined;
					const parsed = JSON.parse(shown.stdout);
					return settled(parsed) ? parsed : undefined;
				}
			);
			evidence.timings.stepsSettledMs = Date.now() - started;
			evidence.execution = record;
			const statuses = Object.fromEntries(Object.entries(record.steps ?? {}).map(([id, s]) => [id, s.status]));
			expect(
				work.every(id => statuses[id] === 'completed'),
				`execution ${executionId}: steps ${JSON.stringify(statuses)}`
			);
			if (park)
				expect(statuses.parked !== 'completed', 'the parked step ran: some worker accepted the parked label');
			else expect(record.status === 'completed', `execution ${executionId} is ${record.status}, not completed`);
			return `execution ${executionId}: ${JSON.stringify(statuses)} after ${evidence.timings.stepsSettledMs} ms`;
		}
	);

	const workspaces = path.join(projectDirectory, '.flow', 'runs');
	const metaDirectory = () => {
		if (!fs.existsSync(workspaces)) return undefined;
		const name = fs
			.readdirSync(workspaces)
			.find(
				entry => entry.endsWith('.meta') && fs.existsSync(path.join(workspaces, entry, 'outputs', 'probe.txt'))
			);
		return name === undefined ? undefined : path.join(workspaces, name);
	};

	await step('the script ran INSIDE the VM (hostname, user and kernel differ from the host)', () => {
		const meta = metaDirectory();
		expect(meta !== undefined, `no .meta directory under ${workspaces}`);
		const probe = fs.readFileSync(path.join(meta, 'outputs', 'probe.txt'), 'utf8');
		evidence.probe = probe;
		const fields = Object.fromEntries(
			probe
				.split(/\r?\n/)
				.filter(line => line.includes('='))
				.map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
		);
		expect(fields.hostname !== os.hostname(), `hostname ${fields.hostname} equals the host`);
		expect(fields.user !== os.userInfo().username, `user ${fields.user} equals the host user`);
		expect(/linux/i.test(fields.kernel), `kernel is "${fields.kernel}", not Linux`);
		expect(/^\/[a-z]\//.test(fields.pwd), `pwd "${fields.pwd}" is not a translated /c/... path`);
		return `vm hostname=${fields.hostname} user=${fields.user} kernel=${fields.kernel} (host ${os.hostname()}/${os.userInfo().username})`;
	});

	await step('outputs and .meta files are on the host', () => {
		const meta = metaDirectory();
		expect(meta !== undefined, 'no .meta directory');
		const files = ['probe.txt', 'forge.txt'].map(file => path.join(meta, 'outputs', file));
		for (const file of files) expect(fs.existsSync(file), `${file} is missing on the host`);
		return files.map(file => `${path.basename(file)} (${fs.statSync(file).size} bytes)`).join(', ');
	});

	await step('the claude session store is under <meta>/sessions/claude on the host', () => {
		const meta = metaDirectory();
		const store = path.join(meta, 'sessions', 'claude');
		const countFiles = directory =>
			fs
				.readdirSync(directory, { withFileTypes: true })
				.reduce(
					(sum, entry) => sum + (entry.isDirectory() ? countFiles(path.join(directory, entry.name)) : 1),
					0
				);
		expect(fs.existsSync(store), `${store} does not exist`);
		const jsonl = [];
		const walk = directory => {
			for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
				const full = path.join(directory, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith('.jsonl')) jsonl.push(full);
			}
		};
		walk(store);
		expect(jsonl.length > 0, `no session transcript (*.jsonl) under ${store}`);
		return `${countFiles(store)} files, transcript ${path.basename(jsonl[0])}`;
	});

	await step('the model answered OK through Bedrock from the sandbox', () => {
		const ask = evidence.execution?.steps?.ask;
		expect(ask !== undefined, 'no "ask" step in the execution record');
		expect(
			ask.status === 'completed',
			`the ask step is ${ask.status}: ${JSON.stringify(ask.io?.stdout ?? ask.error).slice(0, 500)}`
		);
		const answer = JSON.stringify(ask.io?.outputs ?? ask.io?.stdout ?? '');
		expect(/\bOK\b/.test(answer), `no "OK" in the answer of the ask step: ${answer.slice(0, 500)}`);
		const attempt = ask.attemptLog?.at(-1);
		return `answer ${answer.slice(0, 40)}, ${attempt?.durationMs ?? 'n/a'} ms, session ${attempt?.sessionId ?? 'n/a'}`;
	});

	await step(
		'the wrapper log shows the harness relayed the steps (timing lines, no drops of legitimate messages)',
		() => {
			const text = readIfExists(wrapperLog);
			const timing = [...text.matchAll(/timing (\{.*\})/g)].map(match => JSON.parse(match[1]));
			evidence.timings.steps = timing;
			expect(timing.length >= 3, `expected 3 timing lines, found ${timing.length}`);
			const unexpectedDrops = text.split('\n').filter(line => /bridge dropped/.test(line));
			evidence.timings.droppedLines = unexpectedDrops;
			expect(unexpectedDrops.length === 0, `legitimate traffic was dropped: ${unexpectedDrops.join(' | ')}`);
			const durationOf = (record, stepId) => record?.steps?.[stepId]?.attemptLog?.at(-1)?.durationMs;
			// The only host figure: the same commands in a bare bash (no flow worker, no daemon). A like-for-like host worker
			// number is not available here: a registered sandbox worker takes every unlabeled step too (routing by preference).
			const bareBash = [];
			for (let index = 0; index < 5; index += 1) {
				const begin = performance.now();
				spawnSync('bash', ['-c', 'hostname; id -un; uname -sr; pwd'], { encoding: 'utf8', windowsHide: true });
				bareBash.push(Math.round(performance.now() - begin));
			}
			evidence.timings.stepDurationMs = {
				hostBareBashRuns: bareBash,
				sandboxProbeFirstStep: durationOf(evidence.execution, 'probe'),
				sandboxProbeWarm: durationOf(evidence.execution, 'again'),
				sandboxForge: durationOf(evidence.execution, 'forge'),
				sandboxAskModel: durationOf(evidence.execution, 'ask'),
			};
			return timing
				.map(item => `${item.stepId}: sandbox ready ${item.toSandboxReadyMs} ms, step ${item.stepMs} ms`)
				.join('; ');
		}
	);

	await step(
		'forged connections from inside are refused and logged (no token, wrong token, second connection)',
		() => {
			const meta = metaDirectory();
			const forge = fs.readFileSync(path.join(meta, 'outputs', 'forge.txt'), 'utf8');
			evidence.forge = forge;
			const log = readIfExists(wrapperLog);
			expect(/no_token=refused/.test(forge), `no_token attempt: ${forge}`);
			expect(/wrong_token=refused/.test(forge), `wrong_token attempt: ${forge}`);
			expect(
				/bridge refused a connection from [^\n]*no x-flow-bridge-token header/.test(log),
				'no log line for the connection without token'
			);
			expect(
				/bridge refused a connection from [^\n]*(value is wrong|still a placeholder)/.test(log),
				'no log line for the wrong token'
			);
			const visible = /placeholder_visible_in_vm=true/.test(forge);
			evidence.notes.push(`token placeholder readable by a process in the VM: ${visible}`);
			if (visible) {
				expect(
					/placeholder_second_connection=refused/.test(forge),
					`second connection with the placeholder: ${forge}`
				);
				expect(/second inner connection/.test(log), 'no log line for the second connection');
			}
			return `placeholder visible in VM: ${visible}`;
		}
	);

	await step('the sandbox is STOPPED, not removed, after the idle period', async () => {
		const leftovers = new LeftoverSandboxes(
			runtime,
			new SystemClock(),
			{ info: () => undefined, warn: () => undefined },
			new WrapperPresence(presenceDirectory, () => false, process.pid)
		);
		const own = await waitFor('the sandbox to be stopped by the idle timer (12 s)', 90_000, async () => {
			const found = (await leftovers.list()).filter(item => item.wrapperId === wrapperId);
			return found.length === 1 && found[0].status === 'stopped' ? found : undefined;
		});
		created.sandbox = own[0].name;
		evidence.sandbox = own[0];
		// `sbx ls` reports `stopped` while `sbx stop` is still returning, and the wrapper writes its log line only after it returned
		// (SandboxLifecycle.stopHeld): reading the log right now raced with that line (3 of 7 replays, 2026-11-08), so wait for it.
		const expectedStop = park ? /stopped \(idle for 0\.2 min\)/ : /stopped \(daemon_stopping\)/;
		await waitFor('the wrapper log to say why it stopped the sandbox', 20_000, () => expectedStop.test(readIfExists(wrapperLog)));
		const log = readIfExists(wrapperLog);
		if (park)
			expect(
				/stopped \(idle for 0\.2 min\)/.test(log),
				'the wrapper log has no "stopped (idle for 0.2 min)" line'
			);
		else expect(/stopped \(daemon_stopping\)/.test(log), 'the wrapper log has no "stopped (daemon_stopping)" line');
		expect(!/removed: run/.test(log), 'the wrapper removed a sandbox');
		const daemonText = readIfExists(daemonLog);
		evidence.notes.push(
			`the daemon launched the harness ${(daemonText.match(/\[harness\] info: starting:/g) ?? []).length} times; ${(daemonText.match(/is already running/g) ?? []).length} launches were refused by the presence lock`
		);
		return `${own[0].name} is ${own[0].status}`;
	});

	await step(
		'the daemon stops; the wrapper exits and leaves the sandbox stopped (daemon_stopping keeps it)',
		async () => {
			if (daemon.exitCode === null && daemon.signalCode === null) {
				const stop = flow(['stop']);
				evidence.stopOutput = `${stop.stdout}${stop.stderr}`.slice(0, 500);
			}
			await waitFor(
				'the daemon process to exit',
				60_000,
				() => daemon.exitCode !== null || daemon.signalCode !== null
			);
			await waitFor('the wrapper to log its shutdown', 60_000, () =>
				/harness stopped/.test(readIfExists(wrapperLog))
			);
			const sandboxes = await runtime.list();
			const own = sandboxes.find(item => item.name === created.sandbox);
			expect(own !== undefined, `sandbox ${created.sandbox} was removed`);
			expect(own.status === 'stopped', `sandbox status is ${own.status}`);
			return `${own.name} is ${own.status}`;
		}
	);
	await step('no AWS key material in the VM (env, home, tmp, mounts) - positive control included', async () => {
		const name = created.sandbox;
		expect(name !== undefined, 'no sandbox to scan');
		const meta = metaDirectory();
		const workspaceMount = path.join(poolDirectory, 'slot-1');
		const translate = hostPath => `/${hostPath[0].toLowerCase()}${hostPath.slice(2).replaceAll('\\', '/')}`;
		const credentials = await new AwsCredentialExporter({ commandRunner: new NodeCommandRunner() }).export(
			hostProfile
		);
		const patterns = [
			credentials.AccessKeyId,
			credentials.SecretAccessKey,
			(credentials.SessionToken ?? '').slice(0, 80),
		].filter(value => value.length >= 16);
		expect(patterns.length >= 2, 'the host did not return enough credential material to scan for');
		const keyRegex =
			'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|aws_secret_access_key|aws_session_token|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_ACCESS_KEY_ID';
		const scan = [
			'p=$(cat)',
			`find /home/agent /tmp "$@" -xdev -type f -size -4M -not -path '*/node_modules/*' -not -path '/home/agent/.local/lib/*' -not -path '/opt/*' -print0 2>/dev/null | xargs -0 -r grep -IlE '${keyRegex}' 2>/dev/null | sed 's/^/pattern-hit: /'`,
			`find /home/agent /tmp "$@" -xdev -type f -size -4M -not -path '*/node_modules/*' -not -path '/home/agent/.local/lib/*' -not -path '/opt/*' -print0 2>/dev/null | xargs -0 -r grep -IlF -f <(printf "%s\\n" "$p") 2>/dev/null | sed 's/^/exact-hit: /'`,
			'echo scan-done',
		].join('\n');
		const run = async (extra, stdin) =>
			runtime.exec({
				sandbox: name,
				command: ['bash', '-c', scan, 'scan', translate(workspaceMount), translate(meta), ...extra],
				stdin,
				signal: AbortSignal.timeout(180_000),
			});
		const result = await run([], patterns.join('\n'));
		expect(result.exitCode === 0 && result.stdout.includes('scan-done'), `the scan failed: ${result.stderr}`);
		const hits = result.stdout.split('\n').filter(line => /-hit:/.test(line));
		evidence.keyScanHits = hits;
		expect(hits.length === 0, `AWS key material found in the VM: ${hits.join(' | ')}`);
		// Positive control: the same scan must find a planted exact value, otherwise a clean result proves nothing.
		await runtime.exec({
			sandbox: name,
			command: ['bash', '-c', 'printf "CANARY_EXACT_VALUE_123456\\n" > /home/agent/flow-harness-canary.txt'],
		});
		const control = await run([], `${patterns.join('\n')}\nCANARY_EXACT_VALUE_123456`);
		await runtime.exec({ sandbox: name, command: ['rm', '-f', '/home/agent/flow-harness-canary.txt'] });
		expect(
			control.stdout.includes('exact-hit: /home/agent/flow-harness-canary.txt'),
			`the positive control was not detected: ${control.stdout}`
		);
		// The scan restarted the stopped sandbox: stop it again, it must end the check as the harness left it.
		await runtime.stop(name);
		return 'clean, positive control detected';
	});
} finally {
	const wrapperText = readIfExists(wrapperLog);
	evidence.wrapperLogTail = wrapperText.split('\n').slice(-60);
	evidence.daemonLogTail = readIfExists(daemonLog).split('\n').slice(-40);
	if (!keep) {
		if (daemon && daemon.exitCode === null && daemon.signalCode === null) {
			// This script started that daemon, so it may end it.
			daemon.kill();
			await sleep(1500);
		}
		if (created.sandbox === undefined) {
			// The check failed before the idle step: find what this wrapper id left behind.
			const left = (await runtime.list().catch(() => [])).filter(item =>
				item.name.startsWith(`flow-sbx-${wrapperId}-`)
			);
			created.sandbox = left[0]?.name;
		}
		if (created.sandbox !== undefined) {
			try {
				await runtime.remove(created.sandbox);
				console.log(`cleanup: removed sandbox ${created.sandbox}`);
			} catch (error) {
				console.log(
					`cleanup: could not remove ${created.sandbox}: ${error instanceof Error ? error.message : String(error)}. Run: sbx rm ${created.sandbox}`
				);
			}
		}
		try {
			isolation.cleanup();
			console.log('cleanup: removed the isolated tree');
		} catch (error) {
			console.log(
				`cleanup: could not remove ${isolation.root}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	} else {
		console.log(
			`HARNESS_KEEP=1: kept ${isolation.root} and sandbox ${created.sandbox ?? '(none)'}; the daemon (pid ${daemon?.pid}) may still run.`
		);
	}
	evidence.results = results;
	fs.mkdirSync(path.dirname(outputFile), { recursive: true });
	fs.writeFileSync(outputFile, JSON.stringify(evidence, null, 2));
	const failed = results.filter(item => !item.ok);
	console.log(`\n${results.length - failed.length}/${results.length} passed. Evidence: ${outputFile}`);
	if (failed.length > 0) process.exitCode = 1;
}
