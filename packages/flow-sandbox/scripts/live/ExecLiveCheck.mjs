#!/usr/bin/env node

/**
 * GATED live acceptance of milestone M7 (the EXEC variant: engine on the host, step processes in the sandbox through
 * `sbx exec`). Never part of `npm test`, `npm run check` or CI. It makes real Bedrock calls (one word), creates ONE real
 * sandbox and starts a real (isolated) flow daemon. Same flow and same isolation as HarnessLiveCheck.mjs (the relay
 * variant), so the two can be compared by M8.
 *
 * Routing here is by LABELS (`labels: [sandbox]`, a `built-in:command` source), which does NOT isolate against steps a
 * model injects (they carry no labels). The strict form, `requires: [sandbox]` in the flow with a source declared by
 * `--plugin sandbox.<impl>`, needs the sandbox plugin (`npm run bundle --workspace flow-sandbox`), which this script does not declare yet (a plugin live check is a separate task): adding
 * `requires` to its flow alone would make every step wait for a source that declares the guarantee and fail.
 *
 * What it does:
 *  1. builds an ISOLATED flow environment (own FLOW_CONFIG_DIR / XDG_CONFIG_HOME / npm config, see flow-cli
 *     `createIsolatedCliEnv`), registers a throw-away project in the isolated project registry, and declares a
 *     `built-in:command` worker source (`--labels sandbox`) that starts scripts/ExecWrapper.mjs;
 *  2. starts a daemon of THIS checkout (tsx, FLOW_DAEMON_MODE=1) as a child of this script, in that environment;
 *  3. runs a flow (`labels: [sandbox]`): two script steps and a model step (one word) that must run in the sandbox;
 *  4. asserts the outcome (see the PASS lines), checks from INSIDE the VM that the engine's MCP callback is reachable
 *     (and a forged token is refused), then stops the daemon, waits for the wrapper to exit, removes the sandbox it
 *     created and the temporary tree.
 * The real flow daemon and its configuration are never touched: every spawned process gets the isolated environment.
 *
 * Usage (repository root):
 *   SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/ExecLiveCheck.mjs
 * Env:
 *   SBX_LIVE=1             required.
 *   EXEC_IMAGE             sandbox image, default flow-sandbox:m7 (build: image/build-image.mjs --tag flow-sandbox:m7).
 *   EXEC_PROFILE           host AWS profile, default AWS_PROFILE.
 *   EXEC_REGION            default: `aws configure get region --profile <profile>`.
 *   EXEC_OUTPUT            JSON evidence file, default .claude/temp/m7/live-results.json (timings go to timings.json next to it).
 *   EXEC_PARK=0            no parked last step: the flow itself COMPLETES (see HarnessLiveCheck.mjs HARNESS_PARK).
 *   EXEC_MCP_MODEL=1       one more model step that must call the provideSteps tool (a second Bedrock call): proves the MCP
 *                          chain claude (VM) -> forwarder -> host callback -> daemon end to end, and shows where the
 *                          injected step runs. Default: off.
 *   EXEC_KEEP=1            keep the temporary tree and the sandbox for inspection (nothing is cleaned; you remove them).
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
import { McpServer } from '../../../flow-cli/src/worker/McpServer.ts';
import { AwsCredentialExporter } from '../../src/AwsCredentialExporter.ts';
import { HostEnvironment } from '../../src/HostEnvironment.ts';
import { DaemonIsolationGuard } from '../../src/testing/DaemonIsolationGuard.ts';
import { LeftoverSandboxes } from '../../src/LeftoverSandboxes.ts';
import { NodeCommandRunner } from '../../src/NodeCommandRunner.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';
import { SystemClock } from '../../src/SystemClock.ts';
import { WrapperPresence } from '../../src/WrapperPresence.ts';
import { McpCallbackRules } from '../../src/exec/McpCallbackRules.ts';

function refuse(message) {
	console.error(`ExecLiveCheck refused to run: ${message}`);
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
const wrapperScript = path.join(repositoryRoot, 'packages', 'flow-sandbox', 'scripts', 'ExecWrapper.mjs');
const tsxUrl = import.meta.resolve('tsx');
const image = process.env.EXEC_IMAGE ?? 'flow-sandbox:m7';
const hostProfile = process.env.EXEC_PROFILE ?? process.env.AWS_PROFILE;
if (!hostProfile) refuse('no host AWS profile: set EXEC_PROFILE or AWS_PROFILE.');
const keep = process.env.EXEC_KEEP === '1';
const park = process.env.EXEC_PARK !== '0';
const mcpModel = process.env.EXEC_MCP_MODEL === '1';
const outputFile = process.env.EXEC_OUTPUT ?? path.join(repositoryRoot, '.claude', 'temp', 'm7', 'live-results.json');
const timingsFile = path.join(path.dirname(outputFile), 'timings.json');
const realSbx = path.join(process.env.LOCALAPPDATA ?? '', 'DockerSandboxes', 'bin', 'sbx.exe');
const sbxPath = process.env.SBX_PATH ?? (fs.existsSync(realSbx) ? realSbx : undefined);

const forward = value => value.replaceAll('\\', '/');
const evidence = { startedAt: new Date().toISOString(), variant: 'exec', image, hostProfile, notes: [], timings: {} };
const results = [];
const created = { sandbox: undefined };
let daemon;

async function awsText(args) {
	const result = await new NodeCommandRunner().run({ command: 'aws', args, timeoutMs: 30_000 });
	if (result.exitCode !== 0) throw new Error(`aws ${args.join(' ')} failed: ${result.stderr.trim()}`);
	return result.stdout.trim();
}
const region = process.env.EXEC_REGION ?? (await awsText(['configure', 'get', 'region', '--profile', hostProfile]));
if (!region) refuse('no AWS region: set EXEC_REGION or configure one for the profile.');

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
	// A daemon with nothing to do stops after its idle check (default 30 s): keep it alive for the whole check.
	FLOW_DAEMON_IDLE_CHECK_MS: '600000',
	AWS_PROFILE: hostProfile,
	// Planted in the environment of the daemon, hence of the wrapper and of the engine inside it: a script step of the engine
	// receives the whole environment of its worker (isolateEnv: false), so this must NOT reach the VM.
	FLOW_EXEC_AMBIENT_CANARY: `canary-${randomBytes(6).toString('hex')}`,
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
const wrapperId = `ex${randomBytes(2).toString('hex')}`;

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

const parkedStep = () => `
    # No worker has this label, so the step stays queued: the run (and therefore the daemon, which stops about a
    # second after its last work) stays alive, which lets the wrapper's own idle timer fire.
    - id: parked
      name: Never runs (keeps the run open)
      type: script
      shell: bash
      labels:
          - parked
      depends:
          - ${mcpModel ? 'inject' : 'ask'}
      script: echo never
`;

const INJECT_STEP = `
    - id: inject
      name: Inject a step through the MCP tool
      type: model
      model: sonnet
      # Without it claude denies the MCP tool call (no one can approve in a headless run). Fine here: the CLI is in the VM.
      skipPermissions: true
      depends:
          - ask
      prompt: |
          Call the provideSteps tool exactly once with a single step whose id is "from-model", whose type is "script"
          and whose script is: echo "injected-host=$(hostname)"
          After the tool call succeeds, reply with the single word DONE.
`;

function flowFile(directory) {
	const file = path.join(directory, 'sandbox-exec-check.yml');
	fs.writeFileSync(
		file,
		`id: sandbox-exec-check
version: '1.0.0'
name: Sandbox exec check
description: Two script steps and a model step whose processes must run inside a sandbox (engine on the host).

labels:
    - sandbox

# A sandboxed worker accepts only a pool: the in-place workspace would expose <project>/.flow and .git/hooks to the sandbox.
workspace: { provider: pool, dir: '${poolDirectory.replaceAll('\\', '/')}', prefix: slot-, count: 1 }

steps:
    - id: probe
      name: Probe the VM
      type: script
      shell: bash
      env:
          EXEC_DECLARED: declared-value
      script: |
          echo "hostname=$(hostname)"
          echo "user=$(id -un)"
          echo "kernel=$(uname -sr)"
          echo "pwd=$(pwd)"
          echo "declared=$EXEC_DECLARED"
          echo "ambient_canary=$(env | grep -c '^FLOW_EXEC_AMBIENT_CANARY=')"
          echo "worker_token=$(env | grep -c '^FLOW_WORKER_TOKEN=')"
          echo "aws_profile=\${AWS_PROFILE-}"
          echo "path=$PATH"
          echo "home=$HOME"
          echo "aws_names=$(env | grep -E '^(AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_ACCESS_KEY_ID)=' | cut -d= -f1 | tr '\\n' ',')"
          echo "proxy_vars=$(env | grep -c -E '^(HTTPS_PROXY|HTTP_PROXY)=')"
      output:
          report:
              type: string
              from: stdout
              writeOutput: probe.txt

    - id: again
      name: Probe the warm VM again (same commands as probe, for the comparison with the first step)
      type: script
      shell: bash
      depends:
          - probe
      script: |
          echo "hostname=$(hostname)"
          echo "user=$(id -un)"
          echo "kernel=$(uname -sr)"
          echo "pwd=$(pwd)"
      output:
          report:
              type: string
              from: stdout
              writeOutput: again.txt

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
${mcpModel ? INJECT_STEP : ''}${park ? parkedStep() : ''}
`
	);
	return file;
}

/** JSON-RPC driver run INSIDE the VM: the forwarder + the unmodified mcp-server.cjs, one provideSteps call. */
const VM_MCP_DRIVER = [
	"const { spawn } = require('node:child_process')",
	"const child = spawn('node', ['/opt/flow/mcp-callback-forwarder.cjs'], { stdio: ['pipe', 'pipe', 'inherit'], env: process.env })",
	"let buffer = ''",
	"const timer = setTimeout(() => { console.log('driver-timeout'); child.kill(); process.exit(3) }, 25000)",
	"child.stdout.on('data', data => { buffer += data; let index; while ((index = buffer.indexOf('\\n')) >= 0) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line) continue; const message = JSON.parse(line); if (message.id === 2) { clearTimeout(timer); console.log(JSON.stringify(message)); setTimeout(() => { child.kill(); process.exit(0) }, 2000) } } })",
	"child.on('exit', code => { if (code) { console.log('forwarder-exit-' + code); process.exit(4) } })",
	"child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\\n')",
	"child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'provideSteps', arguments: { steps: [{ id: 'live-injected', type: 'script', script: 'echo injected' }] } } }) + '\\n')",
].join(';');

try {
	console.log(`isolated root: ${root}`);
	console.log(`isolated flow config dir: ${configDirectory}`);

	fs.mkdirSync(projectDirectory, { recursive: true });
	fs.mkdirSync(path.join(poolDirectory, 'slot-1'), { recursive: true });
	fs.mkdirSync(presenceDirectory, { recursive: true });
	const project = await addProject(registryDirectory, { name: `exec-${wrapperId}`, path: projectDirectory });
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
		// sbx's own default (a machine-wide setting this check never changes); the wrapper refuses to start without it.
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
			'sbx-exec',
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
		return 'source "sbx-exec" declared in the isolated config dir';
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
		'run the flow; the daemon launches the exec wrapper; probe, again and ask complete in the sandbox',
		async () => {
			const started = Date.now();
			const run = flow(['run', flowPath, '--json'], { timeoutMs: 120_000 });
			evidence.runOutput = `${run.stdout}${run.stderr}`.slice(0, 4000);
			const match = /"executionId"\s*:\s*"([^"]+)"/.exec(run.stdout);
			expect(match !== null, `no executionId in the output of flow run: ${evidence.runOutput}`);
			executionId = match[1];
			const work = mcpModel ? ['probe', 'again', 'ask', 'inject', 'from-model'] : ['probe', 'again', 'ask'];
			// A failed step ends the run: its dependents are never started, so a failed RUN is settled too.
			const settled = record =>
				['failed', 'cancelled'].includes(record?.status) ||
				(park
					? work.every(id => ['completed', 'failed'].includes(record?.steps?.[id]?.status))
					: ['completed', 'failed'].includes(record?.status));
			const record = await waitFor(
				'the three steps to settle (the parked step stays queued by design)',
				300_000,
				() => {
					// A wrapper that cannot start is only noticed by the daemon after its 3 s grace, which then forks a HOST worker for
					// the step: fail now, with the wrapper's own words, instead of waiting for a timeout.
					const crash =
						/\[source sbx-exec\] [^\n]*(?:ERR_[A-Z_]+|ExecWrapper failed(?!: An exec wrapper with wrapper id))[^\n]*/.exec(
							readIfExists(daemonLog)
						);
					if (crash !== null) throw new Error(`the exec wrapper crashed at start: ${crash[0]}`);
					const shown = flow(['show', executionId, '--json']);
					if (shown.status !== 0) return undefined;
					const parsed = JSON.parse(shown.stdout);
					evidence.lastRecord = parsed;
					return settled(parsed) ? parsed : undefined;
				}
			);
			evidence.timings.stepsSettledMs = Date.now() - started;
			evidence.execution = record;
			const statuses = Object.fromEntries(Object.entries(record.steps ?? {}).map(([id, s]) => [id, s.status]));
			const errors = Object.fromEntries(
				Object.entries(record.steps ?? {})
					.filter(([, s]) => s.error !== undefined)
					.map(([id, s]) => [id, String(s.error).slice(0, 600)])
			);
			expect(
				work.every(id => statuses[id] === 'completed'),
				`execution ${executionId} is ${record.status}: steps ${JSON.stringify(statuses)}, errors ${JSON.stringify(errors)}`
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
	const parseFields = text =>
		Object.fromEntries(
			text
				.split(/\r?\n/)
				.filter(line => line.includes('='))
				.map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
		);

	await step('the script ran INSIDE the VM (hostname, user and kernel differ from the host)', () => {
		const meta = metaDirectory();
		expect(meta !== undefined, `no .meta directory under ${workspaces}`);
		const probe = fs.readFileSync(path.join(meta, 'outputs', 'probe.txt'), 'utf8');
		evidence.probe = probe;
		const fields = parseFields(probe);
		expect(fields.hostname !== os.hostname(), `hostname ${fields.hostname} equals the host`);
		expect(fields.user !== os.userInfo().username, `user ${fields.user} equals the host user`);
		expect(/linux/i.test(fields.kernel), `kernel is "${fields.kernel}", not Linux`);
		expect(/^\/[a-z]\//.test(fields.pwd), `pwd "${fields.pwd}" is not a translated /c/... path`);
		return `vm hostname=${fields.hostname} user=${fields.user} kernel=${fields.kernel} (host ${os.hostname()}/${os.userInfo().username})`;
	});

	await step(
		'the VM keeps its own PATH and HOME, the step env arrives, and nothing ambient of the wrapper environment does (no AWS key, no launch token)',
		() => {
			const fields = parseFields(evidence.probe);
			expect(!/[A-Za-z]:\\|;/.test(fields.path), `PATH in the VM looks like the host's: ${fields.path}`);
			expect(fields.home === '/home/agent', `HOME in the VM is "${fields.home}"`);
			expect(fields.aws_names === '', `AWS credential variables in a script's environment: ${fields.aws_names}`);
			expect(
				fields.declared === 'declared-value',
				`the step's own env variable did not arrive: "${fields.declared}"`
			);
			expect(fields.ambient_canary === '0', 'a variable planted in the wrapper environment reached the VM');
			expect(
				fields.worker_token === '0',
				'the daemon launch token (FLOW_WORKER_TOKEN) of the wrapper reached the VM'
			);
			expect(
				fields.aws_profile === '',
				`AWS_PROFILE of the host environment reached a script step: "${fields.aws_profile}"`
			);
			evidence.notes.push(
				`proxy variables in a script's env (sbx exec keeps the sandbox env): ${fields.proxy_vars}`
			);
			return `PATH=${fields.path.slice(0, 60)}... HOME=${fields.home}, proxy vars present: ${fields.proxy_vars}`;
		}
	);

	await step('outputs and .meta files are on the host', () => {
		const meta = metaDirectory();
		expect(meta !== undefined, 'no .meta directory');
		const files = ['probe.txt', 'again.txt'].map(file => path.join(meta, 'outputs', file));
		for (const file of files) expect(fs.existsSync(file), `${file} is missing on the host`);
		return files.map(file => `${path.basename(file)} (${fs.statSync(file).size} bytes)`).join(', ');
	});

	await step('the claude session store is under <meta>/sessions/claude on the host', () => {
		const meta = metaDirectory();
		const store = path.join(meta, 'sessions', 'claude');
		expect(fs.existsSync(store), `${store} does not exist`);
		const jsonl = [];
		let count = 0;
		const walk = directory => {
			for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
				const full = path.join(directory, entry.name);
				if (entry.isDirectory()) walk(full);
				else {
					count += 1;
					if (entry.name.endsWith('.jsonl')) jsonl.push(full);
				}
			}
		};
		walk(store);
		expect(jsonl.length > 0, `no session transcript (*.jsonl) under ${store}`);
		return `${count} files, transcript ${path.basename(jsonl[0])}`;
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
		evidence.sessionIdFromDaemon = attempt?.sessionId;
		const sessionFile = ask.meta?.session_file ?? ask.io?.meta?.session_file;
		if (sessionFile !== undefined) {
			evidence.notes.push(`meta.session_file recorded by the daemon: ${sessionFile}`);
			expect(fs.existsSync(sessionFile), `meta.session_file ${sessionFile} does not exist on the host`);
		}
		return `answer ${answer.slice(0, 40)}, ${attempt?.durationMs ?? 'n/a'} ms, session ${attempt?.sessionId ?? 'n/a'}`;
	});

	if (mcpModel) {
		await step('the model called provideSteps from the VM and the injected step ran (MCP chain end to end)', () => {
			const record = evidence.execution;
			const injectedStep = record?.steps?.['from-model'];
			expect(
				injectedStep !== undefined,
				`no injected step "from-model" in the execution record: ${Object.keys(record?.steps ?? {}).join(',')}`
			);
			expect(injectedStep.status === 'completed', `the injected step is ${injectedStep.status}`);
			const stdout = JSON.stringify(injectedStep.io?.stdout ?? injectedStep.io ?? '');
			const where = /injected-host=([A-Za-z0-9.-]+)/.exec(stdout)?.[1];
			evidence.injected = { stdout: stdout.slice(0, 300), hostname: where, hostHostname: os.hostname() };
			expect(where !== undefined, `no hostname in the output of the injected step: ${stdout.slice(0, 300)}`);
			return `the injected step ran on "${where}" (this host: ${os.hostname()}) ${where === os.hostname() ? '-> ON THE HOST (not isolated)' : '-> not on this host'}`;
		});
	}

	await step(
		'the wrapper log shows the steps through the sandbox launcher (timing lines, MCP rule opened and removed, nothing dropped)',
		() => {
			const text = readIfExists(wrapperLog);
			const timing = [...text.matchAll(/ info: timing (\{.*\})/g)].map(match => JSON.parse(match[1]));
			const processTiming = [...text.matchAll(/process timing (\{.*\})/g)].map(match => JSON.parse(match[1]));
			evidence.timings.steps = timing;
			evidence.timings.processes = processTiming;
			expect(timing.length >= 3, `expected 3 step timing lines, found ${timing.length}`);
			expect(processTiming.length >= 3, `expected process timing lines, found ${processTiming.length}`);
			const dropped = text.split('\n').filter(line => /bridge dropped/.test(line));
			evidence.timings.droppedLines = dropped;
			expect(dropped.length === 0, `legitimate traffic was dropped: ${dropped.join(' | ')}`);
			expect(
				/MCP callback rule added: sandbox=\S+ resource=localhost:\d+/.test(text),
				'no MCP callback rule was added for the model step'
			);
			expect(
				/MCP callback rule removed: sandbox=\S+ resource=localhost:\d+/.test(text),
				'the MCP callback rule was not removed'
			);
			const durationOf = (record, stepId) => record?.steps?.[stepId]?.attemptLog?.at(-1)?.durationMs;
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
				sandboxAskModel: durationOf(evidence.execution, 'ask'),
			};
			return timing
				.map(
					item =>
						`${item.stepId}: sandbox ready ${item.toSandboxReadyMs} ms, prepare ${item.prepareMs} ms, step ${item.stepMs} ms`
				)
				.join('; ');
		}
	);

	// The sandbox is stopped by the idle timer (park) or by daemon_stopping; find it either way.
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
		expect(!/ending process \d+/.test(log), 'a step process was ended by stopping the sandbox in a normal run');
		const daemonText = readIfExists(daemonLog);
		evidence.notes.push(
			`the daemon launched the wrapper ${(daemonText.match(/\[exec\] info: starting:/g) ?? []).length} times; ${(daemonText.match(/is already running/g) ?? []).length} launches were refused by the presence lock`
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
				/exec wrapper stopped/.test(readIfExists(wrapperLog))
			);
			const sandboxes = await runtime.list();
			const own = sandboxes.find(item => item.name === created.sandbox);
			expect(own !== undefined, `sandbox ${created.sandbox} was removed`);
			expect(own.status === 'stopped', `sandbox status is ${own.status}`);
			return `${own.name} is ${own.status}`;
		}
	);

	await step(
		'the engine MCP callback is reachable from the VM through the per-step rule, a forged token is refused (T-08)',
		async () => {
			const name = created.sandbox;
			expect(name !== undefined, 'no sandbox to use');
			const injected = [];
			const server = new McpServer('live-exec-check', steps => {
				injected.push(steps);
				return Promise.resolve();
			});
			const { port, mcpServer } = await server.start();
			const token = mcpServer.env.FLOW_MCP_CALLBACK_TOKEN;
			const callFromVm = async (label, overrideToken) => {
				const before = injected.length;
				const result = await runtime.exec({
					sandbox: name,
					command: ['node', '-e', VM_MCP_DRIVER],
					env: {
						FLOW_MCP_UPSTREAM_HOST: 'host.docker.internal',
						FLOW_MCP_UPSTREAM_PORT: String(port),
						FLOW_MCP_CALLBACK_TOKEN: overrideToken ?? token,
						FLOW_EXECUTION_ID: 'live-exec-check',
					},
					signal: AbortSignal.timeout(60_000),
				});
				await sleep(700);
				const reached = injected.length > before;
				evidence.notes.push(
					`MCP from VM [${label}]: exit ${result.exitCode}, host callback ${reached ? 'RECEIVED' : 'not received'}; stdout ${result.stdout.trim().slice(0, 200)}; stderr ${result.stderr.trim().slice(0, 200)}`
				);
				return { reached, result };
			};
			const rules = new McpCallbackRules(runtime, {
				info: () => undefined,
				warn: message => evidence.notes.push(message),
			});
			try {
				// Observation, not an assertion: M4 measured that a raw TCP connection from the VM reaches a host port with no allow rule.
				const without = await callFromVm('no rule');
				evidence.mcpWithoutRuleReached = without.reached;
				const close = await rules.open(name, port);
				let withRule;
				try {
					withRule = await callFromVm('rule localhost:<port>');
					expect(
						withRule.reached,
						`the host callback did not receive the call with the rule open: ${JSON.stringify(withRule.result)}`
					);
					expect(
						JSON.stringify(injected.at(-1)) ===
							JSON.stringify([{ id: 'live-injected', type: 'script', script: 'echo injected' }]),
						`the host received other steps: ${JSON.stringify(injected.at(-1))}`
					);
					expect(
						/Successfully injected 1 step\(s\): live-injected/.test(withRule.result.stdout),
						`unexpected tool answer: ${withRule.result.stdout}`
					);
					const forged = await callFromVm('forged token, rule open', 'not-the-token-0000');
					expect(!forged.reached, 'a call with a forged token injected steps on the host');
				} finally {
					await close();
				}
				const after = await callFromVm('rule removed');
				evidence.mcpAfterRuleRemovalReached = after.reached;
			} finally {
				await server.stop();
			}
			return `without rule: ${evidence.mcpWithoutRuleReached ? 'reached' : 'blocked'}; with rule: reached; forged token: refused; after removal: ${evidence.mcpAfterRuleRemovalReached ? 'reached' : 'blocked'}`;
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
			command: ['bash', '-c', 'printf "CANARY_EXACT_VALUE_123456\\n" > /home/agent/flow-exec-canary.txt'],
		});
		const control = await run([], `${patterns.join('\n')}\nCANARY_EXACT_VALUE_123456`);
		await runtime.exec({ sandbox: name, command: ['rm', '-f', '/home/agent/flow-exec-canary.txt'] });
		expect(
			control.stdout.includes('exact-hit: /home/agent/flow-exec-canary.txt'),
			`the positive control was not detected: ${control.stdout}`
		);
		// The scan restarted the stopped sandbox: stop it again, it must end the check as the wrapper left it.
		await runtime.stop(name);
		return 'clean, positive control detected';
	});
} finally {
	const wrapperText = readIfExists(wrapperLog);
	evidence.wrapperLogTail = wrapperText.split('\n').slice(-80);
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
			`EXEC_KEEP=1: kept ${isolation.root} and sandbox ${created.sandbox ?? '(none)'}; the daemon (pid ${daemon?.pid}) may still run.`
		);
	}
	evidence.results = results;
	fs.mkdirSync(path.dirname(outputFile), { recursive: true });
	fs.writeFileSync(outputFile, JSON.stringify(evidence, null, 2));
	// For M8: the numbers only, not interpreted here.
	const first = evidence.timings.steps?.[0];
	fs.writeFileSync(
		timingsFile,
		JSON.stringify(
			{
				variant: 'exec',
				image,
				sandboxCreateMs: first?.toSandboxReadyMs,
				preparationMs: first?.prepareMs,
				steps: evidence.timings.steps,
				processes: evidence.timings.processes,
				stepDurationMs: evidence.timings.stepDurationMs,
				stepsSettledMs: evidence.timings.stepsSettledMs,
			},
			null,
			2
		)
	);
	const failed = results.filter(item => !item.ok);
	console.log(`\n${results.length - failed.length}/${results.length} passed. Evidence: ${outputFile}`);
	if (failed.length > 0) process.exitCode = 1;
}
