/**
 * GATED live acceptance of the sandbox PLUGIN end to end: a real flow daemon of this checkout (isolated, see below), the plugin from
 * the BUILT artifact (`--plugin sandbox.exec`), the exec wrapper it starts, the REAL sbx and real Bedrock (one word). Never part of
 * `npm test`, `npm run check` or CI. Creates ONE sandbox (name made by the plugin, prefix `flow-sbx-`), removed at the end of the run by
 * the plugin itself; a `finally` removes whatever is left.
 *
 * What it asserts: the run bound with `requires: [sandbox]` and `workspace: pool` completes; the script step ran inside the VM; the
 * model step answered; the sandbox is gone at the end; `sbx rm --force` took N ms (measured by TimedSbx.mjs, which stands in for sbx via
 * the plugin option sbxPath and records every command); the sandbox was removed BEFORE the daemon released the pool slot (the claim
 * folder `<pool>/.flow-pool/slot-1.claim` disappears after the end of the `rm` command: the daemon releases the workspace only after the
 * wrapper's ack, which follows the removal).
 *
 * Isolation: createIsolatedCliEnv (home, config, app-core settings), FLOW_DAEMON_PORT=0, and DaemonIsolationGuard refuses to start the
 * daemon otherwise. The real user directories reach only the wrapper's sbx and aws children (FLOW_SANDBOX_HOST_*).
 *
 * Usage (repository root): SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/PluginLiveCheck.mjs
 * Env: SBX_LIVE=1 (required), PLUGIN_HIDE_GIT_BASH=1 (start the daemon with Git's bash/sh removed from ITS PATH, see below), SBX_PATH (real sbx; default install dir), PLUGIN_IMAGE (default flow-sandbox:m6), PLUGIN_PROFILE (AWS
 * profile, default AWS_PROFILE), PLUGIN_REGION (default: the profile's region), PLUGIN_OUTPUT (default .claude/temp/sbx-0-51/plugin-results.json).
 * PLUGIN_KEEP=1 keeps the isolated directory (project, pool, daemon log) and prints its path; on any failure the FULL daemon log is copied next to the
 * results file (`<results>.daemon.log`) and its tail is printed. A source that cannot be built or loaded makes every wait fail AT ONCE with the daemon
 * log lines that say why (no 120 s step wait, no 90 s `sbx rm` wait for a run that never started).
 * Exit code: 0 all assertions passed, 1 one failed, 2 refused to run.
 */
import { addProject } from '@wadeck-app/project-sdk';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createIsolatedCliEnv } from '../../../flow-cli/src/test-utils/IsolatedCliEnv.ts';
import { HostEnvironment } from '../../src/HostEnvironment.ts';
import { NodeCommandRunner } from '../../src/NodeCommandRunner.ts';
import { PluginBundler } from '../../src/PluginBundler.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';
import { DaemonIsolationGuard } from '../../src/testing/DaemonIsolationGuard.ts';

function refuse(message) {
	console.error(`PluginLiveCheck refused to run: ${message}`);
	process.exit(2);
}
if (process.env.SBX_LIVE !== '1') {
	refuse('set SBX_LIVE=1 to confirm that you want to create a real sandbox and make a real Bedrock call.');
}
if (process.env.SBX_MOCK_PATH) refuse('SBX_MOCK_PATH is set, the result would not be live. Unset it.');

const here = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(here, '..', '..', '..', '..');
const flowIndex = path.join(repositoryRoot, 'packages', 'flow-cli', 'src', 'cli', 'FlowIndex.ts');
const tsxUrl = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const realSbx = process.env.SBX_PATH ?? path.join(process.env.LOCALAPPDATA ?? '', 'DockerSandboxes', 'bin', 'sbx.exe');
const image = process.env.PLUGIN_IMAGE ?? 'flow-sandbox:m6';
const profile = process.env.PLUGIN_PROFILE ?? process.env.AWS_PROFILE;
if (!profile) refuse('no AWS profile: set PLUGIN_PROFILE or AWS_PROFILE (the SSO session must be valid).');

async function awsText(args) {
	const result = await new NodeCommandRunner().run({ command: 'aws', args, timeoutMs: 30_000 });
	if (result.exitCode !== 0) throw new Error(`aws ${args.join(' ')} failed: ${result.stderr.trim()}`);
	return result.stdout.trim();
}
const region = process.env.PLUGIN_REGION ?? (await awsText(['configure', 'get', 'region', '--profile', profile]));
if (!region) refuse('no AWS region: set PLUGIN_REGION or configure one for the profile.');

// ---- isolated environment (see the header)
const isolation = createIsolatedCliEnv();
const root = fs.realpathSync.native(isolation.root);
const projectDirectory = path.join(root, 'project');
const poolDirectory = path.join(root, 'pool');
const timingLog = path.join(root, 'sbx-timing.jsonl');
const daemonLog = path.join(root, 'daemon.log');
const claimFolder = path.join(poolDirectory, '.flow-pool', 'slot-1.claim');
const environment = {
	...HostEnvironment.isolate(isolation.env),
	FLOW_DAEMON_PORT: '0',
	FLOW_DAEMON_IDLE_CHECK_MS: '600000',
	AWS_PROFILE: profile,
	SBX_REAL_PATH: realSbx,
	SBX_TIMING_LOG: timingLog,
	// A variable of the wrapper's environment that no step declares: the host: true script must NOT see it (design note D4).
	PLUGIN_LIVE_CANARY: `canary-${randomBytes(6).toString('hex')}`,
};
delete environment.SBX_MOCK_PATH;
// PLUGIN_HIDE_GIT_BASH=1: the daemon (and so the wrapper) is started with a PATH that has no directory of Git for Windows that holds bash.exe or
// sh.exe, and without FLOW_BASH_PATH. Only this check's environment changes; the user's PATH and Git are untouched. Proves that the script
// shell comes from the VM (core 1f4b567a: the strategies ask the sandbox launcher), not from a Git Bash on the host.
const hiddenFromPath = [];
if (process.env.PLUGIN_HIDE_GIT_BASH === '1') {
	const pathKey = Object.keys(environment).find(key => key.toLowerCase() === 'path');
	if (pathKey === undefined) refuse('PLUGIN_HIDE_GIT_BASH=1 but the environment has no PATH.');
	const kept = [];
	for (const directory of (environment[pathKey] ?? '').split(path.delimiter)) {
		const holdsShell = ['bash.exe', 'sh.exe'].some(name => fs.existsSync(path.join(directory, name)));
		if (holdsShell && /[\\/]Git[\\/]/i.test(directory)) hiddenFromPath.push(directory);
		else kept.push(directory);
	}
	environment[pathKey] = kept.join(path.delimiter);
	for (const key of Object.keys(environment)) if (key.toUpperCase() === 'FLOW_BASH_PATH') delete environment[key];
	if (hiddenFromPath.length === 0)
		refuse(
			'PLUGIN_HIDE_GIT_BASH=1 but no Git bash directory is on the PATH: nothing to hide, the check would prove nothing.'
		);
	console.log(`Git bash hidden from the daemon PATH: ${hiddenFromPath.join('; ')}`);
}
DaemonIsolationGuard.assert({ env: environment, isolatedRoot: root });
if (path.resolve(isolation.configDir).toLowerCase() === path.resolve(os.homedir(), '.config', 'flow').toLowerCase()) {
	refuse('the flow config dir resolves to the real one.');
}

const evidence = { startedAt: new Date().toISOString(), image, sandboxes: [] };
const results = [];
let daemon;

function flow(args, timeoutMs = 120_000) {
	const result = spawnSync(process.execPath, ['--import', tsxUrl, flowIndex, ...args], {
		env: environment,
		cwd: projectDirectory,
		encoding: 'utf8',
		timeout: timeoutMs,
		windowsHide: true,
	});
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
async function step(name, action) {
	const started = Date.now();
	try {
		const detail = await action();
		results.push({ name, ok: true });
		console.log(`PASS  ${name} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ''}`);
	} catch (error) {
		results.push({ name, ok: false });
		console.log(
			`FAIL  ${name} (${Date.now() - started} ms)\n      ${error instanceof Error ? error.message : String(error)}`
		);
	}
}
function expect(condition, message) {
	if (!condition) throw new Error(message);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
/**
 * The daemon log lines that say the sandbox source cannot be built or reached (the plugin failed to load, its preflight refused the machine, the wrapper
 * could not start), or undefined. Read by every wait below so that a source that never works fails the check at once, with the reason.
 */
function sourceFailure() {
	const lines = readIfExists(daemonLog).split('\n');
	const first = lines.findIndex(
		line =>
			/Last contact with source "sandbox-live" failed/.test(line) ||
			(/sandbox-live/.test(line) &&
				/(could not obtain a worker|could not be built|could not build|failed to (load|build)|plugin .*(refused|failed))/i.test(
					line
				))
	);
	// The line that names the source and the lines after it (the preflight findings and the real cause come right after).
	return first < 0
		? undefined
		: lines
				.slice(first, first + 14)
				.join('\n')
				.trim();
}

async function waitFor(description, timeoutMs, probe) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const failure = sourceFailure();
		if (failure !== undefined) {
			throw new Error(
				`the sandbox source cannot work, so waiting for ${description} is pointless. The daemon says: ${failure}`
			);
		}
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${description}`);
		await sleep(250);
	}
}
const readIfExists = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const timings = () =>
	readIfExists(timingLog)
		.split('\n')
		.filter(Boolean)
		.map(line => JSON.parse(line));

function writeFlow() {
	const file = path.join(projectDirectory, 'plugin-live-check.yml');
	fs.writeFileSync(
		file,
		`id: plugin-live-check
version: '1.0.0'
name: Plugin live check
description: A script step and a model step served by the sandbox source.

requires: [sandbox]

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
          echo "bash_in_vm=$(command -v bash)"
      output:
          report:
              type: string
              from: stdout

    - id: onhost
      name: Probe the wrapper machine (host)
      type: script
      host: true
      shell: bash
      depends:
          - probe
      script: |
          echo "hostname=$(hostname)"
          echo "user=$(id -un)"
          echo "cwd=$(pwd)"
          echo "canary=\${PLUGIN_LIVE_CANARY:-absent}"
          echo "token=\${FLOW_WORKER_TOKEN:-absent}"
          echo "hosthome=\${FLOW_SANDBOX_HOST_HOME:-absent}"

    - id: ask
      name: One word
      type: model
      model: sonnet
      depends:
          - onhost
      env:
          ANTHROPIC_DEFAULT_SONNET_MODEL: ${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? ''}
      prompt: |
          Reply with the single word OK and nothing else.
      output:
          answer:
              type: string
              from: last_message
`
	);
	return file;
}

// Phase B: a model step that writes NO requires and NO profile. The daemon adds the agent profile because the declared source covers it.
function writeImplicitFlow() {
	const file = path.join(projectDirectory, 'plugin-live-implicit.yml');
	fs.writeFileSync(
		file,
		`id: plugin-live-implicit
version: '1.0.0'
name: Plugin live check, implicit agent
description: A model step without requirements.

workspace: { provider: pool, dir: '${poolDirectory.replaceAll('\\', '/')}', prefix: slot-, count: 1 }

steps:
    - id: ask
      name: One word
      type: model
      model: sonnet
      env:
          ANTHROPIC_DEFAULT_SONNET_MODEL: ${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? ''}
      prompt: |
          Reply with the single word OK and nothing else.
      output:
          answer:
              type: string
              from: last_message
`
	);
	return file;
}

// fs=readonly-enforced: `profile: inspect` (agent + fs=readonly-enforced). The pool slot is a :ro secondary mount, .meta the read/write primary.
const INSPECT_REPO_CONTENT = 'repo content that inspect must be able to read';
function writeInspectFlow() {
	const file = path.join(projectDirectory, 'plugin-live-inspect.yml');
	fs.writeFileSync(
		file,
		`id: plugin-live-inspect
version: '1.0.0'
name: Plugin live check, inspect
description: Read the workspace, fail to write it, write to the run meta directory.

profile: inspect

workspace: { provider: pool, dir: '${poolDirectory.replaceAll('\\', '/')}', prefix: slot-, count: 1 }

steps:
    - id: probe
      name: Read, write attempt, meta write
      strict: false
      type: script
      shell: bash
      script: |
          echo "cwd=$(pwd)"
          echo "read=$(cat repo.txt)"
          written=$({ echo changed >> repo.txt; } 2>&1); echo "write_exit=$?"
          echo "write_error=$written"
          created=$({ echo new > new-file.txt; } 2>&1); echo "create_exit=$?"
          echo "create_error=$created"
          echo "workspace_mount=$(awk -v d="$(pwd)" '$5==d {print $6}' /proc/self/mountinfo | head -1)"
          meta=$(awk '{print $5}' /proc/self/mountinfo | grep '\\.meta$' | head -1)
          echo "meta=$meta"
          mkdir -p "$meta/outputs" && echo inspect-wrote-this > "$meta/outputs/inspect-write.txt"; echo "meta_write_exit=$?"
      output:
          report:
              type: string
              from: stdout

    - id: ask
      name: One word
      type: model
      model: sonnet
      depends:
          - probe
      env:
          ANTHROPIC_DEFAULT_SONNET_MODEL: ${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? ''}
      prompt: |
          Reply with the single word OK and nothing else.
      output:
          answer:
              type: string
              from: last_message
`
	);
	return file;
}

// Realpath mounts: the pool is reached through a junction/symlink in an ANCESTOR (the core refuses a link as the pool folder itself).
// The wrapper must mount the RESOLVED directories it checked.
const realParentDirectory = path.join(root, 'parent2');
const linkedParentDirectory = path.join(root, 'via-link');
const linkedPoolDirectory = path.join(linkedParentDirectory, 'pool2');
function writeLinkedFlow() {
	const file = path.join(projectDirectory, 'plugin-live-linked.yml');
	fs.writeFileSync(
		file,
		`id: plugin-live-linked
version: '1.0.0'
name: Plugin live check, pool behind a link
description: A script step in a pool reached through a link.

requires: [sandbox]

workspace: { provider: pool, dir: '${linkedPoolDirectory.replaceAll('\\', '/')}', prefix: slot-, count: 1 }

steps:
    - id: probe
      name: Where am I
      type: script
      shell: bash
      script: |
          echo "cwd=$(pwd)"
          echo "entries=$(ls | wc -l)"
      output:
          report:
              type: string
              from: stdout
`
	);
	return file;
}

// Restart of a STOPPED sandbox: the VM is stopped by the wrapper's idle timer during a host: true gap, then the next step restarts it.
function writeRestartFlow() {
	const file = path.join(projectDirectory, 'plugin-live-restart.yml');
	fs.writeFileSync(
		file,
		`id: plugin-live-restart
version: '1.0.0'
name: Plugin live check, restart of a stopped sandbox
description: A VM step, an idle gap on the host, a VM step in the restarted sandbox, a model step.

requires: [sandbox]

workspace: { provider: pool, dir: '${poolDirectory.replaceAll('\\', '/')}', prefix: slot-, count: 1 }

steps:
    - id: before
      name: Before the gap
      type: script
      shell: bash
      script: |
          echo "restart-marker-$$" > restart-marker.txt
          echo "hostname=$(hostname)"
          echo "boot=$(cat /proc/sys/kernel/random/boot_id)"
          echo "uptime=$(cut -d' ' -f1 /proc/uptime)"
          echo "proxy=\${HTTPS_PROXY:-none}"
          echo vm-tmp > /tmp/vm-marker
          echo vm-home > "$HOME/vm-marker"

    - id: gap
      name: Idle gap on the host (the VM idles)
      type: script
      host: true
      shell: bash
      depends:
          - before
      script: |
          sleep 24
          echo gap-done

    - id: after
      name: After the gap, in the restarted sandbox
      type: script
      shell: bash
      strict: false
      depends:
          - gap
      script: |
          echo "marker=$(cat restart-marker.txt)"
          echo "hostname=$(hostname)"
          echo "boot=$(cat /proc/sys/kernel/random/boot_id)"
          echo "uptime=$(cut -d' ' -f1 /proc/uptime)"
          echo "proxy=\${HTTPS_PROXY:-none}"
          echo "vm_tmp_marker=$(cat /tmp/vm-marker 2>/dev/null || echo gone)"
          echo "vm_home_marker=$(cat "$HOME/vm-marker" 2>/dev/null || echo gone)"
          echo "vm_staged=$(ls /tmp/flow-staged 2>/dev/null | wc -l)"
          written=$({ echo again > restart-after.txt; } 2>&1); echo "workspace_write_exit=$?"
          meta=$(awk '{print $5}' /proc/self/mountinfo | grep '\\.meta$' | head -1)
          mkdir -p "$meta/outputs" && echo restarted > "$meta/outputs/restart-write.txt"; echo "meta_write_exit=$?"

    - id: ask
      name: One word (credentials after the restart)
      type: model
      model: sonnet
      depends:
          - after
      env:
          ANTHROPIC_DEFAULT_SONNET_MODEL: ${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? ''}
      prompt: |
          Reply with the single word OK and nothing else.
      output:
          answer:
              type: string
              from: last_message
`
	);
	return file;
}

/** What the host's sbx says about rules and secrets, as text (read-only commands). */
function sbxText(...words) {
	try {
		return execFileSync(realSbx, words, { encoding: 'utf8', timeout: 60_000, windowsHide: true });
	} catch (error) {
		return `(sbx ${words.join(' ')} failed: ${error instanceof Error ? error.message : String(error)})`;
	}
}
const linesMentioning = (text, name) => text.split(/\r?\n/).filter(line => line.includes(name)).length;

// Codex and OpenCode as plain prompts through Bedrock (one short prompt each). Models: PLUGIN_CODEX_MODEL (default openai.gpt-5.6-terra),
// PLUGIN_OPENCODE_MODEL (default amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0: the catalog bundled in the image must know the id, see README). The account behind the profile must be allowed to call them.
// PLUGIN_TOOLS_ONLY=codex|opencode|both runs only the codex and opencode steps, so that each can use the profile that is allowed to call its models
// (for example PLUGIN_PROFILE=<the Codex profile> PLUGIN_TOOLS_ONLY=codex). Unset: every section.
const toolsOnly = process.env.PLUGIN_TOOLS_ONLY;
if (toolsOnly !== undefined && !['codex', 'opencode', 'both'].includes(toolsOnly))
	refuse('PLUGIN_TOOLS_ONLY must be codex, opencode or both.');
const codexModel = process.env.PLUGIN_CODEX_MODEL ?? 'openai.gpt-5.6-terra';
const opencodeModel = process.env.PLUGIN_OPENCODE_MODEL ?? 'amazon-bedrock/anthropic.claude-haiku-4-5-20251001-v1:0';
function writeToolsFlow(only) {
	const file = path.join(projectDirectory, `plugin-live-tools-${only}.yml`);
	const steps = [];
	if (only !== 'opencode') {
		steps.push(`    - id: codex
      name: Codex one word
      type: model
      provider: codex
      model: ${codexModel}
      prompt: Reply with the single word OK and nothing else.
      output:
          answer:
              type: string
              from: last_message`);
	}
	if (only !== 'codex') {
		steps.push(`    - id: opencode
      name: OpenCode one word
      type: model
      provider: opencode
      model: ${opencodeModel}
      prompt: Reply with the single word OK and nothing else.
      output:
          answer:
              type: string
              from: last_message`);
	}
	fs.writeFileSync(
		file,
		`id: plugin-live-tools-${only}
version: '1.0.0'
name: Plugin live check, codex and opencode
description: One short prompt per tool.

workspace: { provider: pool, dir: '${poolDirectory.replaceAll('\\', '/')}', prefix: slot-, count: 1 }

steps:
${steps.join('\n\n')}
`
	);
	return file;
}

const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-live-art-'));
const claimEvents = { seen: undefined, gone: undefined };
// Sandboxes that exist before this check: only a sandbox created after this point may be removed by it.
const sandboxesBefore = new Set(
	(await new SbxCliRuntime({ env: { ...process.env, SBX_PATH: realSbx } }).list()).map(entry => entry.name)
);
let claimWatcher;
try {
	console.log(`isolated root: ${root}`);
	fs.mkdirSync(projectDirectory, { recursive: true });
	fs.mkdirSync(path.join(poolDirectory, 'slot-1'), { recursive: true });

	await step('build the plugin artifact', async () => {
		await new PluginBundler().bundle(path.join(artifactRoot, 'dist-plugin'));
		return path.join(artifactRoot, 'dist-plugin');
	});

	const registry = path.join(String(environment.XDG_CONFIG_HOME), 'project');
	const project = await addProject(registry, { name: 'plugin-live', path: projectDirectory });
	await step('declare the source with the plugin (TimedSbx as sbxPath, real sbx behind it)', () => {
		const declared = flow([
			'worker',
			'source',
			'add',
			'sandbox-live',
			'--provider',
			'sandbox',
			'--plugin',
			'sandbox.exec',
			'--plugins-dir',
			path.join(artifactRoot, 'dist-plugin'),
			'--option',
			`projects=${project.id}`,
			'--option',
			`region=${region}`,
			'--option',
			`profiles=claude=${profile}`,
			'--option',
			`image=${image}`,
			'--option',
			'pull=never',
			'--option',
			`sbxPath=${path.join(here, 'TimedSbx.mjs')}`,
			// Accepted openly: ssh.agentForwardingEnabled is on by default on this machine and this check never changes a setting.
			'--option',
			'acceptSshAgentForwarding=true',
			// The wrapper stops an idle sandbox after 12 s (sbx itself would after about 30 s): the restart step below needs the wrapper's own stop.
			'--option',
			'idleStopMinutes=0.2',
		]);
		expect(declared.status === 0, `flow worker source add failed: ${declared.stderr}${declared.stdout}`);
	});

	const log = fs.openSync(daemonLog, 'a');
	daemon = spawn(process.execPath, ['--import', tsxUrl, flowIndex], {
		env: { ...environment, FLOW_DAEMON_MODE: '1' },
		cwd: repositoryRoot,
		stdio: ['ignore', log, log],
		windowsHide: true,
	});
	await waitFor('the daemon to publish worker.port', 60_000, () =>
		fs.existsSync(path.join(isolation.configDir, 'worker.port'))
	);

	// The claim folder appears when the daemon allocates the slot and disappears when it releases it: poll finely.
	claimWatcher = setInterval(() => {
		const present = fs.existsSync(claimFolder);
		if (present && claimEvents.seen === undefined) claimEvents.seen = Date.now();
		if (!present && claimEvents.seen !== undefined && claimEvents.gone === undefined) claimEvents.gone = Date.now();
	}, 20);

	let record;
	if (toolsOnly === undefined) {
		let runOutput = '';
		await step('run the bound flow (VM script, host: true script and model step) to completion', async () => {
			const file = writeFlow();
			const started = flow(['run', file, '--json']);
			const validated = flow(['validate', file]);
			runOutput = `${validated.stdout}${validated.stderr}`;
			const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
			expect(match !== null, `no executionId from flow run: ${started.stdout}${started.stderr}`);
			const executionId = match[1];
			evidence.executionId = executionId;
			record = await waitFor(`execution ${executionId} to settle`, 240_000, () => {
				const shown = flow(['show', executionId, '--json']);
				if (shown.status !== 0) return undefined;
				const parsed = JSON.parse(shown.stdout);
				return ['completed', 'failed', 'cancelled'].includes(parsed.status) ? parsed : undefined;
			});
			const statuses = Object.fromEntries(Object.entries(record.steps ?? {}).map(([id, s]) => [id, s.status]));
			expect(record.status === 'completed', `execution is ${record.status}: ${JSON.stringify(statuses)}`);
			return JSON.stringify(statuses);
		});

		await step(
			'the script step ran INSIDE the VM, the model step answered, both through the sandbox source',
			() => {
				expect(record !== undefined, 'no execution record');
				const probe = record.steps?.probe?.io?.stdout?.text ?? '';
				const fields = Object.fromEntries(
					probe
						.split(/\r?\n/)
						.filter(line => line.includes('='))
						.map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
				);
				expect(
					fields.hostname && fields.hostname !== os.hostname(),
					`hostname ${fields.hostname} is the host's or missing`
				);
				expect(
					fields.user && fields.user !== os.userInfo().username,
					`user ${fields.user} is the host user or missing`
				);
				expect(
					/\bOK\b/.test(JSON.stringify(record.steps?.ask?.output ?? record.steps?.ask ?? {})),
					'the model step did not answer OK'
				);
				expect(
					record.steps?.probe?.sourceId === 'sandbox-live',
					`probe served by ${record.steps?.probe?.sourceId}`
				);
				expect(fields.bash_in_vm?.startsWith('/'), `bash_in_vm=${fields.bash_in_vm}: not a path of the VM`);
				evidence.hiddenGitBashDirectories = hiddenFromPath;
				return `vm ${fields.hostname}/${fields.user}/${fields.kernel}, script shell ${fields.bash_in_vm}${hiddenFromPath.length > 0 ? ' (Git bash hidden on the host)' : ''}`;
			}
		);

		await step(
			'the host: true script ran on the WRAPPER machine, with the user rights, without the wrapper secrets and canary',
			() => {
				expect(record !== undefined, 'no execution record');
				const read = text =>
					Object.fromEntries(
						text
							.split(/\r?\n/)
							.filter(line => line.includes('='))
							.map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()])
					);
				const onHost = read(record.steps?.onhost?.io?.stdout?.text ?? '');
				const inVm = read(record.steps?.probe?.io?.stdout?.text ?? '');
				expect(
					record.steps?.onhost?.sourceId === 'sandbox-live',
					`onhost served by ${record.steps?.onhost?.sourceId}`
				);
				expect(
					onHost.hostname === os.hostname(),
					`host script hostname ${onHost.hostname} is not this machine's (${os.hostname()})`
				);
				expect(onHost.hostname !== inVm.hostname, `host and VM report the same hostname ${onHost.hostname}`);
				expect(
					onHost.user?.toLowerCase().endsWith(os.userInfo().username.toLowerCase()),
					`host script user ${onHost.user} is not ${os.userInfo().username}`
				);
				expect(inVm.user !== os.userInfo().username, 'the unmarked script did not run in the VM');
				// The workspace (the pool slot), not the project directory.
				expect(
					/slot-1/.test(onHost.cwd ?? ''),
					`host script cwd ${onHost.cwd} is not the pool slot of the run`
				);
				expect(onHost.canary === 'absent', `the wrapper canary reached the host script: ${onHost.canary}`);
				expect(onHost.token === 'absent', 'FLOW_WORKER_TOKEN reached the host script');
				expect(onHost.hosthome === 'absent', 'a FLOW_SANDBOX_HOST_* carrier reached the host script');
				expect(
					/has host: true in a flow that also has model steps/.test(runOutput),
					'flow validate printed no host-script-with-model-steps warning for a flow that mixes a model step with a host script'
				);
				evidence.hostScript = { host: onHost, vm: inVm };
				return `host ${onHost.hostname}/${onHost.user} vs vm ${inVm.hostname}/${inVm.user}; canary and token absent; cwd ${onHost.cwd}`;
			}
		);

		await step('the sandbox is removed at the end of the run, and sbx rm took N ms', async () => {
			const removal = await waitFor('the sbx rm call of the run', 90_000, () =>
				timings().find(entry => entry.words[0] === 'rm')
			);
			evidence.sbxRm = { ...removal, durationMs: removal.endedAt - removal.startedAt };
			const left = new SbxCliRuntime({ env: { ...process.env, SBX_PATH: realSbx } });
			const remaining = (await left.list()).filter(
				entry => entry.name.startsWith('flow-sbx-') && entry.status !== undefined
			);
			evidence.sandboxesAfter = remaining.map(entry => entry.name);
			expect(removal.exitCode === 0, `sbx rm exited ${removal.exitCode}`);
			return `sbx rm --force: ${evidence.sbxRm.durationMs} ms (exit ${removal.exitCode})`;
		});

		await step('the sandbox was removed BEFORE the daemon released the pool slot (ack after removal)', async () => {
			await waitFor('the daemon to release the pool slot', 60_000, () => claimEvents.gone);
			const removal = evidence.sbxRm;
			expect(claimEvents.seen !== undefined, 'the claim folder was never seen (the pool was not used?)');
			evidence.release = {
				claimSeenMsBeforeRmStart: removal.startedAt - claimEvents.seen,
				rmEndedMsBeforeRelease: claimEvents.gone - removal.endedAt,
			};
			expect(
				claimEvents.gone >= removal.endedAt,
				`the pool claim vanished ${removal.endedAt - claimEvents.gone} ms BEFORE sbx rm ended`
			);
			return `rm ended ${evidence.release.rmEndedMsBeforeRelease} ms before the claim was released (polling 20 ms)`;
		});

		await step(
			'a model step WITHOUT requires is confined implicitly: served by the sandbox source, recorded as implicit, answers in the VM',
			async () => {
				const createsBefore = timings().filter(entry => entry.words[0] === 'create').length;
				const started = flow(['run', writeImplicitFlow(), '--json']);
				const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
				expect(match !== null, `no executionId from flow run: ${started.stdout}${started.stderr}`);
				const executionId = match[1];
				const implicit = await waitFor(`execution ${executionId} to settle`, 240_000, () => {
					const shown = flow(['show', executionId, '--json']);
					if (shown.status !== 0) return undefined;
					const parsed = JSON.parse(shown.stdout);
					return ['completed', 'failed', 'cancelled'].includes(parsed.status) ? parsed : undefined;
				});
				expect(
					implicit.status === 'completed',
					`implicit-agent run is ${implicit.status}: ${JSON.stringify(implicit.steps)}`
				);
				expect(
					implicit.steps?.ask?.sourceId === 'sandbox-live',
					`model step served by ${implicit.steps?.ask?.sourceId}`
				);
				const added = implicit.requirements?.implicit;
				expect(
					added !== undefined &&
						added.requires.join() === 'env=clean,fs=confined' &&
						added.steps.join() === 'ask',
					`requirements.implicit is ${JSON.stringify(added)}`
				);
				expect(
					/\bOK\b/.test(JSON.stringify(implicit.steps?.ask?.output ?? implicit.steps?.ask ?? {})),
					'the model step did not answer OK'
				);
				const creates = timings().filter(entry => entry.words[0] === 'create').length;
				expect(
					creates === createsBefore + 1,
					`expected one more sandbox, ${creates - createsBefore} were created`
				);
				evidence.implicitAgent = { executionId, requirements: implicit.requirements };
				return `served by ${implicit.steps.ask.sourceId}, implicit ${added.requires.join(',')}`;
			}
		);

		await step('the implicit-agent sandbox is removed too', async () => {
			await waitFor(
				'the second sbx rm call',
				90_000,
				() => timings().filter(entry => entry.words[0] === 'rm').length >= 2
			);
			const remaining = (await new SbxCliRuntime({ env: { ...process.env, SBX_PATH: realSbx } }).list()).filter(
				entry => entry.name.startsWith('flow-sbx-') && !sandboxesBefore.has(entry.name)
			);
			expect(remaining.length === 0, `sandboxes left: ${remaining.map(entry => entry.name).join(', ')}`);
		});

		await step(
			'profile: inspect on real sbx: the repo is readable, a write to the workspace fails read-only, .meta is writable, the model step answers',
			async () => {
				const slot = path.join(poolDirectory, 'slot-1');
				const repoFile = path.join(slot, 'repo.txt');
				fs.writeFileSync(repoFile, INSPECT_REPO_CONTENT);
				const createsBefore = timings().filter(entry => entry.words[0] === 'create').length;
				const started = flow(['run', writeInspectFlow(), '--json']);
				const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
				expect(match !== null, `no executionId from flow run: ${started.stdout}${started.stderr}`);
				const executionId = match[1];
				const inspect = await waitFor(`execution ${executionId} to settle`, 240_000, () => {
					const shown = flow(['show', executionId, '--json']);
					if (shown.status !== 0) return undefined;
					const parsed = JSON.parse(shown.stdout);
					return ['completed', 'failed', 'cancelled'].includes(parsed.status) ? parsed : undefined;
				});
				const statuses = Object.fromEntries(
					Object.entries(inspect.steps ?? {}).map(([id, s]) => [id, s.status])
				);
				expect(
					inspect.status === 'completed',
					`inspect run is ${inspect.status}: ${JSON.stringify(statuses)} ${JSON.stringify(inspect.steps)}`
				);
				const text = inspect.steps?.probe?.io?.stdout?.text ?? '';
				const fields = Object.fromEntries(
					text
						.split(/\r?\n/)
						.filter(line => line.includes('='))
						.map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()])
				);
				expect(fields.read === INSPECT_REPO_CONTENT, `the repo was not readable: read=${fields.read}`);
				expect(
					fields.write_exit !== '0' && /Read-only file system/.test(fields.write_error ?? ''),
					`the write to the workspace did not fail read-only: exit ${fields.write_exit}, ${fields.write_error}`
				);
				expect(
					fields.create_exit !== '0' && /Read-only file system/.test(fields.create_error ?? ''),
					`creating a file in the workspace did not fail read-only: exit ${fields.create_exit}, ${fields.create_error}`
				);
				expect(
					/\bro\b/.test(fields.workspace_mount ?? ''),
					`the workspace mount options do not show ro: ${fields.workspace_mount}`
				);
				expect(
					fields.meta_write_exit === '0',
					`the write to .meta failed: exit ${fields.meta_write_exit}, meta=${fields.meta}`
				);
				// The verdict is taken on the HOST.
				expect(fs.readFileSync(repoFile, 'utf8') === INSPECT_REPO_CONTENT, 'the host file repo.txt changed');
				expect(!fs.existsSync(path.join(slot, 'new-file.txt')), 'a file was created in the slot on the host');
				const runsDirectory = path.join(projectDirectory, '.flow', 'runs');
				const written = fs
					.readdirSync(runsDirectory)
					.map(name => path.join(runsDirectory, name, 'outputs', 'inspect-write.txt'))
					.find(candidate => fs.existsSync(candidate));
				expect(written !== undefined, 'the file written to .meta/outputs from the VM is not on the host');
				expect(
					/\bOK\b/.test(JSON.stringify(inspect.steps?.ask?.output ?? inspect.steps?.ask ?? {})),
					'the model step did not answer OK under inspect'
				);
				expect(
					inspect.steps?.probe?.sourceId === 'sandbox-live' &&
						inspect.steps?.ask?.sourceId === 'sandbox-live',
					'a step was not served by the sandbox source'
				);
				const required = inspect.requirements?.steps?.probe ?? [];
				expect(
					required.includes('fs=readonly-enforced'),
					`the record does not show fs=readonly-enforced: ${JSON.stringify(inspect.requirements)}`
				);
				const creates = timings().filter(entry => entry.words[0] === 'create');
				expect(creates.length === createsBefore + 1, 'expected exactly one more sandbox');
				// TimedSbx records only the first two words of a command, so the :ro of the create line is proven by the VM (mount options) and by the mock e2e.
				evidence.inspect = { fields, requirements: inspect.requirements };
				return `read ok, write: ${fields.write_error}, workspace mount options ${fields.workspace_mount}, .meta write ok, host file unchanged`;
			}
		);

		await step('the inspect sandbox is removed too', async () => {
			await waitFor(
				'the third sbx rm call',
				90_000,
				() => timings().filter(entry => entry.words[0] === 'rm').length >= 3
			);
			const remaining = (await new SbxCliRuntime({ env: { ...process.env, SBX_PATH: realSbx } }).list()).filter(
				entry => entry.name.startsWith('flow-sbx-') && !sandboxesBefore.has(entry.name)
			);
			expect(remaining.length === 0, `sandboxes left: ${remaining.map(entry => entry.name).join(', ')}`);
		});

		await step(
			'a pool reached through a link: the wrapper mounts the resolved directory, the step runs in it',
			async () => {
				fs.mkdirSync(path.join(realParentDirectory, 'pool2', 'slot-1'), { recursive: true });
				fs.symlinkSync(
					realParentDirectory,
					linkedParentDirectory,
					process.platform === 'win32' ? 'junction' : 'dir'
				);
				const started = flow(['run', writeLinkedFlow(), '--json']);
				const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
				expect(match !== null, `no executionId from flow run: ${started.stdout}${started.stderr}`);
				const executionId = match[1];
				const linked = await waitFor(`execution ${executionId} to settle`, 240_000, () => {
					const shown = flow(['show', executionId, '--json']);
					if (shown.status !== 0) return undefined;
					const parsed = JSON.parse(shown.stdout);
					return ['completed', 'failed', 'cancelled'].includes(parsed.status) ? parsed : undefined;
				});
				expect(
					linked.status === 'completed',
					`linked-pool run is ${linked.status}: ${JSON.stringify(linked.steps)}`
				);
				const text = linked.steps?.probe?.io?.stdout?.text ?? '';
				const cwd = (/^cwd=(.*)$/m.exec(text) ?? [])[1]?.trim() ?? '';
				expect(
					cwd.endsWith('/parent2/pool2/slot-1') && !cwd.includes('via-link'),
					`the step did not run in the resolved slot: cwd=${cwd}`
				);
				evidence.linkedPool = { cwd };
				return `ran in ${cwd}`;
			}
		);

		await step('the linked-pool sandbox is removed too', async () => {
			await waitFor(
				'the fourth sbx rm call',
				90_000,
				() => timings().filter(entry => entry.words[0] === 'rm').length >= 4
			);
			const remaining = (await new SbxCliRuntime({ env: { ...process.env, SBX_PATH: realSbx } }).list()).filter(
				entry => entry.name.startsWith('flow-sbx-') && !sandboxesBefore.has(entry.name)
			);
			expect(remaining.length === 0, `sandboxes left: ${remaining.map(entry => entry.name).join(', ')}`);
		});

		await step(
			'a STOPPED sandbox is restarted by the next step: mounts, credentials and rules still in place, with the time it takes',
			async () => {
				fs.mkdirSync(path.join(poolDirectory, 'slot-1'), { recursive: true });
				const rmBefore = timings().filter(entry => entry.words[0] === 'rm').length;
				const started = flow(['run', writeRestartFlow(), '--json']);
				const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
				expect(match !== null, `no executionId from flow run: ${started.stdout}${started.stderr}`);
				const executionId = match[1];
				const probe = new SbxCliRuntime({ env: { ...process.env, SBX_PATH: realSbx } });
				// Sample the sandbox status while the run goes; when it reads stopped, look at what sbx still holds for it.
				const samples = [];
				let stoppedSnapshot;
				let sandboxName;
				const settled = (async () => {
					for (;;) {
						const shown = flow(['show', executionId, '--json']);
						const parsed = shown.status === 0 ? JSON.parse(shown.stdout) : undefined;
						if (parsed && ['completed', 'failed', 'cancelled'].includes(parsed.status)) return parsed;
						await sleep(300);
					}
				})();
				const sampler = (async () => {
					for (;;) {
						const mine = (await probe.list()).filter(
							entry => entry.name.startsWith('flow-sbx-') && !sandboxesBefore.has(entry.name)
						);
						const entry = mine[0];
						if (entry !== undefined) {
							sandboxName = entry.name;
							if (samples.at(-1)?.status !== entry.status)
								samples.push({ at: Date.now(), status: entry.status });
							if (entry.status === 'stopped' && stoppedSnapshot === undefined) {
								stoppedSnapshot = {
									policy: linesMentioning(sbxText('policy', 'ls'), entry.name),
									secret: linesMentioning(sbxText('secret', 'ls'), entry.name),
								};
							}
						}
						if (await Promise.race([settled.then(() => true), sleep(500).then(() => false)])) return;
					}
				})();
				const record = await settled;
				await sampler;
				const statuses = Object.fromEntries(
					Object.entries(record.steps ?? {}).map(([id, s]) => [id, s.status])
				);
				expect(
					record.status === 'completed',
					`restart run is ${record.status}: ${JSON.stringify(statuses)} ${JSON.stringify(record.steps)}`
				);
				const read = id => {
					const out = record.steps?.[id]?.io?.stdout?.text ?? '';
					return Object.fromEntries(
						out
							.split(/\r?\n/)
							.filter(line => line.includes('='))
							.map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()])
					);
				};
				const before = read('before');
				const after = read('after');
				expect(
					samples.some(sample => sample.status === 'stopped'),
					`sbx never reported the sandbox stopped: ${JSON.stringify(samples)}`
				);
				expect(stoppedSnapshot !== undefined, 'no snapshot of the rules and secrets while stopped');
				const log = readIfExists(daemonLog);
				expect(
					/restarted for the next step/.test(log),
					'the wrapper log has no "restarted for the next step" line'
				);
				expect(
					after.marker?.startsWith('restart-marker-'),
					`the file written before the gap is not in the workspace after the restart: marker=${after.marker}`
				);
				expect(
					after.hostname === before.hostname,
					`another sandbox answered: ${before.hostname} then ${after.hostname}`
				);
				expect(
					after.workspace_write_exit === '0',
					`the workspace is not writable after the restart: exit ${after.workspace_write_exit}`
				);
				expect(
					after.meta_write_exit === '0',
					`.meta is not writable after the restart: exit ${after.meta_write_exit}`
				);
				expect(
					/\bOK\b/.test(JSON.stringify(record.steps?.ask?.output ?? record.steps?.ask ?? {})),
					'the model step did not answer OK after the restart (credentials, secret or rules lost)'
				);
				expect(
					stoppedSnapshot.policy > 0,
					`no network rule for the stopped sandbox in \`sbx policy ls\`: ${JSON.stringify(stoppedSnapshot)}`
				);
				// Timing lines of the wrapper: toSandboxReadyMs is the create for the first step and the restart for the one after the gap.
				const timing = id => {
					const matches = [...log.matchAll(new RegExp(`timing (\\{"stepId":"${id}"[^}]*\\})`, 'g'))];
					const last = matches.at(-1);
					return last === undefined ? undefined : JSON.parse(last[1]);
				};
				const first = timing('before');
				const second = timing('after');
				expect(
					first !== undefined && second !== undefined,
					'the wrapper timing lines of the two steps were not found in the daemon log'
				);
				await waitFor(
					'the restart run sandbox to be removed',
					90_000,
					() => timings().filter(entry => entry.words[0] === 'rm').length > rmBefore
				);
				const afterRun = {
					sandboxes: (await probe.list()).filter(entry => entry.name === sandboxName).length,
					policy: linesMentioning(sbxText('policy', 'ls'), sandboxName),
					secret: linesMentioning(sbxText('secret', 'ls'), sandboxName),
				};
				expect(
					afterRun.sandboxes === 0 && afterRun.policy === 0 && afterRun.secret === 0,
					`something of the run is left after its end: ${JSON.stringify(afterRun)}`
				);
				evidence.restart = {
					sandbox: sandboxName,
					createMs: first.toSandboxReadyMs,
					restartMs: second.toSandboxReadyMs,
					beforeStep: first,
					afterStep: second,
					boot: { before: before.boot, after: after.boot, same: before.boot === after.boot },
					uptime: { before: before.uptime, after: after.uptime },
					vmFileSystem: {
						tmpMarker: after.vm_tmp_marker,
						homeMarker: after.vm_home_marker,
						stagedFilesAfter: after.vm_staged,
					},
					proxy: { before: before.proxy, after: after.proxy },
					statusSamples: samples,
					whileStopped: stoppedSnapshot,
					afterRun,
				};
				return `create ${first.toSandboxReadyMs} ms, restart ${second.toSandboxReadyMs} ms; boot id ${before.boot === after.boot ? 'unchanged' : 'changed'}, uptime ${before.uptime} s then ${after.uptime} s; rules while stopped ${stoppedSnapshot.policy}, secrets ${stoppedSnapshot.secret}; nothing left after the run`;
			}
		);
	}

	for (const tool of ['codex', 'opencode'].filter(
		candidate => toolsOnly === undefined || toolsOnly === 'both' || toolsOnly === candidate
	)) {
		await step(
			`a ${tool} step answers in the sandbox as a plain prompt (real Bedrock): tool-aware credentials, store on the .meta mount`,
			async () => {
				const started = flow(['run', writeToolsFlow(tool), '--json']);
				const match = /"executionId"\s*:\s*"([^"]+)"/.exec(started.stdout);
				expect(match !== null, `no executionId from flow run: ${started.stdout}${started.stderr}`);
				const executionId = match[1];
				const record = await waitFor(`execution ${executionId} to settle`, 240_000, () => {
					const shown = flow(['show', executionId, '--json']);
					if (shown.status !== 0) return undefined;
					const parsed = JSON.parse(shown.stdout);
					return ['completed', 'failed', 'cancelled'].includes(parsed.status) ? parsed : undefined;
				});
				const stepRecord = record.steps?.[tool];
				expect(
					record.status === 'completed',
					`${tool} run is ${record.status}: ${stepRecord?.error ?? ''} | stderr: ${String(stepRecord?.io?.stderr?.text ?? '').slice(-900)} | stdout: ${String(stepRecord?.io?.stdout?.text ?? '').slice(-900)} | ${JSON.stringify(stepRecord).slice(0, 500)}`
				);
				expect(stepRecord.sourceId === 'sandbox-live', `served by ${stepRecord.sourceId}`);
				expect(
					/\bOK\b/.test(JSON.stringify(stepRecord.output ?? stepRecord)),
					`the ${tool} step did not answer OK: ${JSON.stringify(stepRecord.output ?? {})}`
				);
				evidence[`${tool}Step`] = {
					model: tool === 'codex' ? codexModel : opencodeModel,
					sessionId: stepRecord.meta?.session_id,
					durationMs: stepRecord.meta?.duration_ms,
				};
				// Its session store is on the run's .meta mount, on the host.
				const runsDirectory = path.join(projectDirectory, '.flow', 'runs');
				const stores = fs
					.readdirSync(runsDirectory)
					.filter(name => fs.existsSync(path.join(runsDirectory, name, 'sessions', tool)));
				expect(stores.length > 0, `no session store of ${tool} under ${runsDirectory}/<run>.meta/sessions`);
				return `answered OK (${tool === 'codex' ? codexModel : opencodeModel}), store on the mount: ${stores.at(-1)}`;
			}
		);
		await step(`the ${tool} sandbox is removed too`, async () => {
			await sleep(1500);
			const remaining = (await new SbxCliRuntime({ env: { ...process.env, SBX_PATH: realSbx } }).list()).filter(
				entry => entry.name.startsWith('flow-sbx-') && !sandboxesBefore.has(entry.name)
			);
			expect(remaining.length === 0, `sandboxes left: ${remaining.map(entry => entry.name).join(', ')}`);
		});
	}

	await step('every sbx command of the run, with its duration', () => {
		const lines = timings().map(
			entry => `${entry.words.join(' ')}: ${entry.endedAt - entry.startedAt} ms (exit ${entry.exitCode})`
		);
		evidence.sbxCommands = lines;
		return `${lines.length} commands`;
	});
} catch (error) {
	console.log(`FAIL  unexpected error\n      ${error instanceof Error ? error.stack : String(error)}`);
	results.push({ name: 'unexpected error', ok: false });
} finally {
	if (claimWatcher) clearInterval(claimWatcher);
	try {
		flow(['stop'], 30_000);
	} catch {
		// the daemon is also killed below
	}
	if (daemon?.pid !== undefined && daemon.exitCode === null) {
		await waitFor('the daemon to exit', 15_000, () => daemon.exitCode !== null || undefined).catch(() => undefined);
		if (daemon.exitCode === null) daemon.kill();
	}
	await sleep(500);
	// Whatever the plugin left (a failed run): this check created it, this check removes it.
	try {
		const runtime = new SbxCliRuntime({ env: { ...process.env, SBX_PATH: realSbx } });
		for (const entry of await runtime.list()) {
			if (/^flow-sbx-/.test(entry.name) && !sandboxesBefore.has(entry.name)) {
				evidence.sandboxes.push(entry.name);
				await runtime.remove(entry.name);
				console.log(`cleanup: removed leftover sandbox ${entry.name}`);
			}
		}
	} catch (error) {
		console.error(
			`CLEANUP CHECK FAILED: run "sbx ls" and remove any flow-sbx-* sandbox of this check by hand: ${error.message}`
		);
	}
	evidence.daemonLogTail = readIfExists(daemonLog).slice(-4000);
	const output =
		process.env.PLUGIN_OUTPUT ?? path.join(repositoryRoot, '.claude', 'temp', 'sbx-0-51', 'plugin-results.json');
	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, JSON.stringify({ evidence, results }, null, 2));
	fs.rmSync(artifactRoot, { recursive: true, force: true });
	const failed = results.some(result => !result.ok);
	const keep = process.env.PLUGIN_KEEP === '1';
	if (failed) {
		// The isolated directory (and with it the daemon log) is removed below: keep a full copy next to the results, and show the end of it.
		const copy = `${output}.daemon.log`;
		const full = readIfExists(daemonLog);
		fs.writeFileSync(copy, full);
		console.log(`--- daemon log (last 60 lines of ${full.split('\n').length}; the full log: ${copy}) ---`);
		console.log(full.split('\n').slice(-60).join('\n'));
	}
	if (keep) {
		console.log(
			`PLUGIN_KEEP=1: the isolated directory is kept: ${root} (daemon log: ${daemonLog}). Remove it yourself when done.`
		);
	} else {
		isolation.cleanup();
	}
	const passed = results.filter(result => result.ok).length;
	console.log(`${passed}/${results.length} passed. Evidence: ${output}`);
	process.exit(passed === results.length ? 0 : 1);
}
