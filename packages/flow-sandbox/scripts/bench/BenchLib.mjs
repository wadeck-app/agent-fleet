/**
 * Shared plumbing of the M8 benchmark (relay vs exec vs host). GATED: every entry point calls `requireLive()`.
 * Reuses the isolated-daemon approach of scripts/live/HarnessLiveCheck.mjs and ExecLiveCheck.mjs: own flow config dir,
 * own project registry, a daemon of THIS checkout started as a child of the bench, real sbx login and real AWS session.
 * Nothing here touches the real flow daemon or its configuration.
 */
import { addProject } from '@wadeck-app/project-sdk';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createIsolatedCliEnv } from '../../../flow-cli/src/test-utils/IsolatedCliEnv.ts';
import { HostEnvironment } from '../../src/HostEnvironment.ts';
import { NodeCommandRunner } from '../../src/NodeCommandRunner.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';
import { DaemonIsolationGuard } from '../../src/testing/DaemonIsolationGuard.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, '..', '..', '..', '..');
export const outputDirectory = path.join(repositoryRoot, '.claude', 'temp', 'm8');
const flowIndex = path.join(repositoryRoot, 'packages', 'flow-cli', 'src', 'cli', 'FlowIndex.ts');
const tsxUrl = import.meta.resolve('tsx');
const processScript = path.join(here, 'SampleProcesses.ps1');

/** Minimum free physical memory (GiB) the bench keeps; a level that would go below it is not run. */
export const MIN_FREE_GIB = 2.5;
/** Memory configured per sandbox (defaults of this package: 2 cpus / 2g). */
export const SANDBOX_GIB = 2;

export const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export const forward = value => value.replaceAll('\\', '/');
export const freeGiB = () => os.freemem() / 2 ** 30;

export function requireLive() {
	if (process.env.SBX_LIVE !== '1') {
		console.error('Bench refused to run: set SBX_LIVE=1 (real sandboxes, real daemon, real Bedrock calls).');
		process.exit(2);
	}
	if (process.env.SBX_MOCK_PATH) {
		console.error('Bench refused to run: SBX_MOCK_PATH is set, the result would not be live.');
		process.exit(2);
	}
}

export function stats(values) {
	const sorted = values.filter(value => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
	if (sorted.length === 0) return { n: 0 };
	const middle = Math.floor(sorted.length / 2);
	const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
	return {
		n: sorted.length,
		median: Math.round(median),
		min: Math.round(sorted[0]),
		max: Math.round(sorted.at(-1)),
		...(sorted.length === 1 ? { singleRun: true } : {}),
	};
}

export async function waitFor(description, timeoutMs, probe, pollMs = 250) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${description}`);
		await sleep(pollMs);
	}
}

export const readIfExists = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');

export function saveJson(name, data) {
	fs.mkdirSync(outputDirectory, { recursive: true });
	const file = path.join(outputDirectory, name);
	fs.writeFileSync(file, JSON.stringify(data, null, 2));
	console.log(`wrote ${file}`);
	return file;
}

const realSbx = path.join(process.env.LOCALAPPDATA ?? '', 'DockerSandboxes', 'bin', 'sbx.exe');
export const sbxPath = process.env.SBX_PATH ?? (fs.existsSync(realSbx) ? realSbx : undefined);
export const runtime = new SbxCliRuntime(sbxPath ? { binaryPath: sbxPath } : undefined);

export function sbx(args, timeoutMs = 60_000) {
	const result = spawnSync(sbxPath ?? 'sbx', args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
	return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export const hostProfile = process.env.BENCH_PROFILE ?? process.env.AWS_PROFILE;
let cachedRegion;
export async function awsRegion() {
	if (process.env.BENCH_REGION) return process.env.BENCH_REGION;
	if (cachedRegion) return cachedRegion;
	const result = await new NodeCommandRunner().run({
		command: 'aws',
		args: ['configure', 'get', 'region', '--profile', hostProfile],
		timeoutMs: 90_000,
	});
	if (result.exitCode !== 0 || !result.stdout.trim())
		throw new Error(`no AWS region: set BENCH_REGION (aws said: ${result.stderr.trim()})`);
	cachedRegion = result.stdout.trim();
	return cachedRegion;
}

/** Names of all `flow-sbx-*` sandboxes right now (any owner). */
export async function listPluginSandboxes() {
	return (await runtime.list()).filter(item => item.name.startsWith('flow-sbx-'));
}

// ---------------------------------------------------------------------------------------------------------------
// Sampler: free memory + cpu from os (every second), per-process working sets from a PowerShell script file.
// ---------------------------------------------------------------------------------------------------------------
export class Sampler {
	constructor({ intervalMs = 1000, processEveryMs = 4000 } = {}) {
		this.intervalMs = intervalMs;
		this.processEveryMs = processEveryMs;
		this.samples = [];
		this.processSamples = [];
		this.timer = undefined;
		this.lastCpu = undefined;
		this.lastProcess = 0;
		this.processBusy = false;
		this.processErrors = 0;
	}

	static cpuTimes() {
		return os.cpus().reduce(
			(sum, cpu) => ({
				idle: sum.idle + cpu.times.idle,
				total: sum.total + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq,
			}),
			{ idle: 0, total: 0 }
		);
	}

	start() {
		this.startedAt = Date.now();
		this.lastCpu = Sampler.cpuTimes();
		this.timer = setInterval(() => this.tick(), this.intervalMs);
		this.tick();
		return this;
	}

	tick() {
		const now = Date.now();
		const current = Sampler.cpuTimes();
		const totalDelta = current.total - this.lastCpu.total;
		const cpuPct = totalDelta > 0 ? 100 * (1 - (current.idle - this.lastCpu.idle) / totalDelta) : 0;
		this.lastCpu = current;
		this.samples.push({ t: now - this.startedAt, freeGiB: +freeGiB().toFixed(3), cpuPct: +cpuPct.toFixed(1) });
		if (now - this.lastProcess >= this.processEveryMs && !this.processBusy) {
			this.lastProcess = now;
			this.processBusy = true;
			const child = spawn(
				'powershell',
				['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', processScript],
				{ windowsHide: true }
			);
			let text = '';
			child.stdout.on('data', data => (text += data));
			child.on('close', () => {
				this.processBusy = false;
				try {
					const rows = JSON.parse(text);
					const groups = {};
					for (const row of rows) {
						const group = (groups[row.n] ??= { count: 0, wsMB: 0, cpuSec: 0 });
						group.count += 1;
						group.wsMB += row.w / 2 ** 20;
						group.cpuSec += row.c;
					}
					for (const group of Object.values(groups)) {
						group.wsMB = Math.round(group.wsMB);
						group.cpuSec = +group.cpuSec.toFixed(1);
					}
					this.processSamples.push({ t: Date.now() - this.startedAt, groups });
				} catch {
					this.processErrors += 1;
				}
			});
			child.on('error', () => (this.processErrors += 1));
		}
	}

	stop() {
		clearInterval(this.timer);
		return this.summary();
	}

	summary() {
		const free = this.samples.map(sample => sample.freeGiB);
		const cpu = this.samples.map(sample => sample.cpuPct);
		// Focused groups (sum of working sets over all processes whose name matches), first sample = baseline.
		const groupDefinitions = {
			sandboxRuntime: /nerdbox|containerd|^sbx|sandbox|llmman|vmmem|qemu|docker/i,
			node: /^node$/i,
			claude: /^claude$/i,
			bash: /^(bash|sh)$/i,
		};
		const groups = {};
		for (const [label, regex] of Object.entries(groupDefinitions)) {
			const series = this.processSamples.map(sample => ({
				t: sample.t,
				wsMB: Object.entries(sample.groups)
					.filter(([name]) => regex.test(name))
					.reduce((sum, [, group]) => sum + group.wsMB, 0),
				count: Object.entries(sample.groups)
					.filter(([name]) => regex.test(name))
					.reduce((sum, [, group]) => sum + group.count, 0),
			}));
			if (series.length === 0) continue;
			const peak = series.reduce((best, item) => (item.wsMB > best.wsMB ? item : best), series[0]);
			groups[label] = { baselineMB: series[0].wsMB, peakMB: peak.wsMB, peakCount: peak.count, baselineCount: series[0].count };
		}
		const top = groups;
		return {
			durationMs: Date.now() - this.startedAt,
			freeGiB: { first: free[0], min: Math.min(...free), last: free.at(-1) },
			cpuPct: { mean: +(cpu.reduce((a, b) => a + b, 0) / (cpu.length || 1)).toFixed(1), max: Math.max(...cpu) },
			processGroups: top,
			processSamples: this.processSamples.length,
			processErrors: this.processErrors,
		};
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Flow files
// ---------------------------------------------------------------------------------------------------------------
/** Set by the bench world before any flow is written: the directory of its pool (slots slot-1..slot-8). */
let poolDirectoryOfFlows;

export function flowHeader({ id, labelled }) {
	if (poolDirectoryOfFlows === undefined) throw new Error('flowHeader: no bench world has set its pool directory yet.');
	return `id: ${id}
version: '1.0.0'
name: ${id}
description: M8 benchmark flow

${labelled ? 'labels:\n    - sandbox\n' : ''}
# A sandboxed worker accepts only a pool: the in-place workspace would expose <project>/.flow and .git/hooks to the sandbox.
workspace: { provider: pool, dir: '${poolDirectoryOfFlows.replaceAll('\\', '/')}', prefix: slot-, count: 8 }

steps:
`;
}

export function scriptStep({ id, depends, script = 'echo ok', extra = '' }) {
	return `    - id: ${id}
      name: ${id}
      type: script
      shell: bash
${depends ? `      depends:\n          - ${depends}\n` : ''}${extra}      script: ${script}
`;
}

export function modelStep({ id, depends, prompt, extra = '', model = 'sonnet' }) {
	return `    - id: ${id}
      name: ${id}
      type: model
      model: ${model}
${extra}${depends ? `      depends:\n          - ${depends}\n` : ''}      prompt: |
          ${prompt}
`;
}

// ---------------------------------------------------------------------------------------------------------------
// BenchEnv: one isolated daemon + (for relay/exec) N wrapper sources, for one repetition.
// ---------------------------------------------------------------------------------------------------------------
export const VARIANTS = {
	host: { image: undefined, script: undefined },
	relay: { image: process.env.BENCH_RELAY_IMAGE ?? 'flow-sandbox:m4', script: 'HarnessWrapper.mjs' },
	exec: { image: process.env.BENCH_EXEC_IMAGE ?? 'flow-sandbox:m7', script: 'ExecWrapper.mjs' },
};

export class BenchEnv {
	/**
	 * @param {object} options
	 * @param {'host'|'relay'|'exec'} options.variant
	 * @param {number} [options.sources] number of wrapper sources (one wrapper = one run), relay/exec only
	 * @param {number|string} [options.idleMinutes]
	 * @param {string[]} [options.extraWrapperArgs]
	 * @param {NodeJS.ProcessEnv} [options.env] overrides for the daemon (and so wrapper / host worker) environment
	 * @param {string} [options.profile] host AWS profile used by the wrappers (default: the bench profile)
	 */
	constructor(options) {
		this.options = options;
		this.variant = options.variant;
		this.sourceCount = options.sources ?? 1;
		this.wrapperIds = [];
		this.daemon = undefined;
		this.timeline = {};
		this.isolation = createIsolatedCliEnv();
		this.root = fs.realpathSync.native(this.isolation.root);
		this.configDirectory = this.isolation.configDir;
		this.projectDirectory = path.join(this.root, 'project');
		this.daemonLog = path.join(this.root, 'daemon.log');
		this.presenceDirectory = path.join(this.root, 'presence');
		this.environment = {
			...this.isolation.env,
			// HOME, USERPROFILE, APPDATA, LOCALAPPDATA and APP_CORE_* stay isolated for the daemon (incident 2026-11-08); the real
			// directories reach the wrapper's own sbx and aws children through FLOW_SANDBOX_HOST_* (HostEnvironment).
			...HostEnvironment.capture(),
			FLOW_DAEMON_PORT: '0',
			...(sbxPath ? { SBX_PATH: sbxPath } : {}),
			FLOW_DAEMON_IDLE_CHECK_MS: '600000',
			AWS_PROFILE: options.profile ?? hostProfile,
			...options.env,
		};
		delete this.environment.SBX_MOCK_PATH;
		DaemonIsolationGuard.assert({ env: this.environment, isolatedRoot: this.root });
		// Variables of the interactive Claude Code session that runs this bench must not leak into a nested claude.
		for (const key of Object.keys(this.environment))
			if (/^(CLAUDE_CODE_(?!USE_BEDROCK)|CLAUDE_PID|CLAUDE_BASH|CLAUDE_EFFORT)/i.test(key)) delete this.environment[key];
		// Host baseline: a clean claude config dir, like the fresh VM. Without it the host claude runs the user's own
		// SessionStart hooks, plugins and skills (measured: 21 s for the one-word step instead of ~6 s) and the comparison is unfair.
		if (this.variant === 'host' && options.realClaudeConfig !== true) {
			this.environment.CLAUDE_CONFIG_DIR = path.join(this.root, 'claude-config');
			fs.mkdirSync(this.environment.CLAUDE_CONFIG_DIR, { recursive: true });
		}
		if (path.resolve(this.configDirectory).toLowerCase() === path.resolve(os.homedir(), '.config', 'flow').toLowerCase())
			throw new Error(`the isolated config dir ${this.configDirectory} equals the real flow config dir.`);
		fs.mkdirSync(this.projectDirectory, { recursive: true });
		poolDirectoryOfFlows = path.join(this.root, 'pool');
		for (let slot = 1; slot <= 8; slot++) fs.mkdirSync(path.join(poolDirectoryOfFlows, `slot-${slot}`), { recursive: true });
		fs.mkdirSync(this.presenceDirectory, { recursive: true });
	}

	wrapperLog(index) {
		return path.join(this.root, `wrapper-${index}.log`);
	}

	flow(args, options = {}) {
		return spawnSync(process.execPath, ['--import', tsxUrl, flowIndex, ...args], {
			env: this.environment,
			cwd: options.cwd ?? this.projectDirectory,
			encoding: 'utf8',
			timeout: options.timeoutMs ?? 120_000,
			windowsHide: true,
		});
	}

	async prepare() {
		const registryDirectory = path.join(this.environment.XDG_CONFIG_HOME, 'project');
		const project = await addProject(registryDirectory, {
			name: `bench-${randomBytes(2).toString('hex')}`,
			path: this.projectDirectory,
		});
		this.projectId = project.id;
		if (this.variant === 'host') return;
		const { script } = VARIANTS[this.variant];
		const image = this.options.image ?? VARIANTS[this.variant].image;
		const region = await awsRegion();
		for (let index = 0; index < this.sourceCount; index += 1) {
			const wrapperId = `${this.variant === 'relay' ? 'br' : 'be'}${randomBytes(2).toString('hex')}`;
			this.wrapperIds.push(wrapperId);
			const args = [
				`--import=${tsxUrl}`,
				forward(path.join(repositoryRoot, 'packages', 'flow-sandbox', 'scripts', script)),
				'--wrapper-id',
				wrapperId,
				'--project-id',
				project.id,
				'--project-path',
				forward(this.projectDirectory),
				'--profile',
				`claude=${this.options.profile ?? hostProfile}`,
				'--region',
				region,
				'--image',
				image,
				'--pull',
				'never',
				'--idle-minutes',
				String(this.options.idleMinutes ?? 5),
				'--accept-ssh-agent-forwarding',
				'--presence-dir',
				forward(this.presenceDirectory),
				'--log-file',
				forward(this.wrapperLog(index)),
				...(process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
					? ['--model-env', `ANTHROPIC_DEFAULT_SONNET_MODEL=${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL}`]
					: []),
				...(this.options.extraWrapperArgs ?? []),
			];
			const declared = this.flow([
				'worker',
				'source',
				'add',
				`bench-${index}`,
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
				...args.map(value => `--arg=${value}`),
			]);
			if (declared.status !== 0)
				throw new Error(`declaring source bench-${index} failed (exit ${declared.status}): ${declared.stderr}${declared.stdout}`);
		}
	}

	async startDaemon() {
		const log = fs.openSync(this.daemonLog, 'a');
		const started = Date.now();
		this.daemon = spawn(process.execPath, ['--import', tsxUrl, flowIndex], {
			env: { ...this.environment, FLOW_DAEMON_MODE: '1' },
			cwd: repositoryRoot,
			stdio: ['ignore', log, log],
			windowsHide: true,
		});
		await waitFor('the daemon to publish worker.port', 60_000, () =>
			fs.existsSync(path.join(this.configDirectory, 'worker.port'))
		);
		this.timeline.daemonStartMs = Date.now() - started;
		return this.daemon.pid;
	}

	daemonAlive() {
		return this.daemon !== undefined && this.daemon.exitCode === null && this.daemon.signalCode === null;
	}

	writeFlow(name, yaml) {
		const file = path.join(this.projectDirectory, `${name}.yml`);
		fs.writeFileSync(file, yaml);
		const validation = this.flow(['validate', file]);
		if (validation.status !== 0)
			throw new Error(`flow ${name} is invalid (exit ${validation.status}): ${validation.stderr}${validation.stdout}`);
		return file;
	}

	/** Issues `flow run`; resolves when the daemon accepted it (execution id on stdout). Times are Date.now(). */
	async run(flowPath, extraArgs = []) {
		const issuedAt = Date.now();
		const child = spawn(process.execPath, ['--import', tsxUrl, flowIndex, 'run', flowPath, '--json', ...extraArgs], {
			env: this.environment,
			cwd: this.projectDirectory,
			windowsHide: true,
		});
		let out = '';
		child.stdout.on('data', data => (out += data));
		child.stderr.on('data', data => (out += data));
		const exited = new Promise(resolve => child.on('close', resolve));
		const executionId = await waitFor('flow run to print an executionId', 120_000, () => {
			const match = /"executionId"\s*:\s*"([^"]+)"/.exec(out);
			return match?.[1];
		}, 50);
		return { executionId, issuedAt, acceptedAt: Date.now(), child, exited, output: () => out };
	}

	executionFile(executionId) {
		return path.join(this.configDirectory, 'executions', `${executionId}.json`);
	}

	record(executionId) {
		try {
			return JSON.parse(fs.readFileSync(this.executionFile(executionId), 'utf8'));
		} catch {
			return undefined;
		}
	}

	/** Polls the persisted record until `done(record)`. Throws with the daemon log tail on timeout. */
	async waitRecord(executionId, done, timeoutMs, description) {
		let last;
		try {
			return await waitFor(
				description,
				timeoutMs,
				() => {
					last = this.record(executionId) ?? last;
					return last !== undefined && done(last) ? last : undefined;
				},
				200
			);
		} catch (error) {
			const statuses = last ? Object.fromEntries(Object.entries(last.steps ?? {}).map(([k, v]) => [k, v.status])) : 'no record';
			throw new Error(`${error.message}; last statuses ${JSON.stringify(statuses)}`);
		}
	}

	waitSettled(executionId, timeoutMs = 300_000) {
		return this.waitRecord(
			executionId,
			record => ['completed', 'failed', 'cancelled'].includes(record.status),
			timeoutMs,
			`execution ${executionId} to settle`
		);
	}

	wrapperText(index = 0) {
		return readIfExists(this.wrapperLog(index));
	}

	allWrapperText() {
		return this.wrapperIds.map((_, index) => this.wrapperText(index)).join('\n');
	}

	/** Our sandboxes (by wrapper id prefix). */
	async ownSandboxes() {
		const all = await runtime.list().catch(() => []);
		return all.filter(item => this.wrapperIds.some(id => item.name.startsWith(`flow-sbx-${id}-`)));
	}

	async stopDaemonGracefully(timeoutMs = 60_000) {
		if (!this.daemonAlive()) return;
		this.flow(['stop']);
		await waitFor('the daemon to exit', timeoutMs, () => !this.daemonAlive()).catch(() => undefined);
	}

	/** Removes what this env created: the daemon it started, its sandboxes, the isolated tree. Returns notes. */
	async cleanup({ keep = false } = {}) {
		const notes = [];
		if (this.daemonAlive()) {
			this.daemon.kill();
			await sleep(1500);
			notes.push('daemon killed by cleanup');
		}
		// let the wrappers see the daemon go away and exit by themselves
		await sleep(1500);
		for (const sandbox of await this.ownSandboxes()) {
			try {
				await runtime.remove(sandbox.name);
				notes.push(`removed ${sandbox.name}`);
			} catch (error) {
				notes.push(`COULD NOT remove ${sandbox.name}: ${error.message}. Run: sbx rm ${sandbox.name}`);
			}
		}
		if (!keep) {
			try {
				this.isolation.cleanup();
			} catch (error) {
				notes.push(`could not remove ${this.isolation.root}: ${error.message}`);
			}
		}
		return notes;
	}
}

/** All timing lines the wrappers wrote: harness `timing`, exec `timing` and `process timing`. */
export function parseWrapperTimings(text) {
	const timing = [...text.matchAll(/^(\S+) .*? info: timing (\{.*\})/gm)].map(match => ({ at: match[1], ...JSON.parse(match[2]) }));
	const processTiming = [...text.matchAll(/process timing (\{.*\})/g)].map(match => JSON.parse(match[1]));
	return { timing, processTiming };
}

/** Step facts from a persisted execution record. */
export function stepFacts(record, id) {
	const step = record?.steps?.[id];
	if (!step) return undefined;
	const attempt = step.attemptLog?.at(-1);
	return {
		id,
		status: step.status,
		startedAt: step.startedAt ? Date.parse(step.startedAt) : undefined,
		completedAt: step.completedAt ? Date.parse(step.completedAt) : undefined,
		attemptDurationMs: attempt?.durationMs,
		sourceId: step.sourceId,
		sessionId: step.meta?.session_id,
		error: step.error,
	};
}

/** Host processes whose command line contains one of the fragments (PowerShell script file, read-only). */
export function findProcesses(fragments) {
	const result = spawnSync(
		'powershell',
		['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'FindProcesses.ps1'), '-Fragments', fragments.join('|')],
		{ encoding: 'utf8', windowsHide: true, timeout: 60_000 }
	);
	try {
		return JSON.parse(result.stdout);
	} catch {
		return [{ error: `unreadable output: ${result.stdout.slice(0, 200)} ${result.stderr.slice(0, 200)}` }];
	}
}

/** `sbx ls` as the user sees it. */
export function sbxLsText() {
	return sbx(['ls']).stdout.trim();
}
