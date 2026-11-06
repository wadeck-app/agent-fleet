#!/usr/bin/env node

/**
 * GATED live check of SandboxLifecycle, RunMounts and LeftoverSandboxes against the REAL sbx.
 * Never part of `npm test`, `npm run check` or CI.
 *
 * It creates up to three sandboxes named `flow-sbx-lv<hex>-live-<hex>` (the plugin marker, so they are also
 * what `LeftoverCli.mjs list` shows) and removes them in a `finally`. Takes about two minutes and uses
 * CPU/RAM for that time. It changes no setting and no machine-wide policy.
 *
 * How the idle STOP / RESTART path is proven: sbx itself stops an idle VM after ~30 s, which would hide the
 * wrapper's own timer. The check therefore runs the wrapper timer with idleStopMinutes = 0.2 (12 s), well
 * before sbx's 30 s, and asserts that the stop is the wrapper's (the lifecycle log says "idle for 0.2 min")
 * and that `sbx ls` reports `stopped`. The default of 5 minutes is the open-session (relay) case, where the
 * session keeps the VM up and only this timer stops it; it is covered by unit tests with a fake clock.
 *
 * Usage (from the repository root):
 *   SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/LifecycleLiveCheck.mjs
 *
 * Env: SBX_LIVE=1 (required), SBX_PATH (sbx executable if not in the default install directory),
 *      SBX_LIVE_DRY_RUN=1 (run against the mock to test this script; bash steps fail there by design).
 *
 * Exit code: 0 all steps passed, 1 a step failed, 2 refused to run.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { LeftoverSandboxes } from '../../src/LeftoverSandboxes.ts';
import { RunMounts } from '../../src/RunMounts.ts';
import { SandboxCapacity } from '../../src/SandboxCapacity.ts';
import { SandboxLifecycle } from '../../src/SandboxLifecycle.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';
import { SystemClock } from '../../src/SystemClock.ts';
import { SystemScheduler } from '../../src/SystemScheduler.ts';
import { WrapperPresence } from '../../src/WrapperPresence.ts';

function refuse(message) {
	console.error(`LifecycleLiveCheck refused to run: ${message}`);
	process.exit(2);
}

if (process.env.SBX_LIVE !== '1') {
	refuse('set SBX_LIVE=1 to confirm that you want to create and remove real sandboxes on this machine.');
}
const dryRun = process.env.SBX_LIVE_DRY_RUN === '1';
if (!dryRun && process.env.SBX_MOCK_PATH) {
	refuse('SBX_MOCK_PATH is set, so the result would not be live. Unset it (or set SBX_LIVE_DRY_RUN=1).');
}

const IDLE_MINUTES = 0.2;
const suffix = randomBytes(2).toString('hex');
const wrapperA = `lv${suffix}a`;
const wrapperB = `lv${suffix}b`;
const wrapperC = `lv${suffix}c`;
const runA = `live-${suffix}`;
const runB = `other-${suffix}`;
const runD = `dead-${suffix}`;
const runE = `crash-${suffix}`;
const nameOf = (wrapper, run) => `flow-sbx-${wrapper}-${run}`;

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-lifecycle-live-${suffix}-`)));
const presenceDirectory = path.join(root, 'presence');
const results = [];
const logLines = [];
const log = {
	info: message => logLines.push(`info: ${message}`),
	warn: message => logLines.push(`warn: ${message}`),
};

function makeMounts(label) {
	const workspace = path.join(root, `${label}-ws`);
	const meta = path.join(root, `${label}-ws.meta`);
	fs.mkdirSync(workspace);
	fs.mkdirSync(meta);
	return new RunMounts({ workspaceDir: workspace, workspaceMetaDir: meta, platform: process.platform, log });
}

function isProcessAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === 'EPERM';
	}
}

const runtime = new SbxCliRuntime();
const presence = new WrapperPresence(presenceDirectory, isProcessAlive, process.pid);
const capacity = new SandboxCapacity(runtime, 4);
const leftovers = new LeftoverSandboxes(runtime, new SystemClock(), log, presence);
const scheduler = new SystemScheduler();

function newLifecycle(wrapperId, idleStopMinutes = IDLE_MINUTES) {
	const lifecycle = new SandboxLifecycle(
		{ wrapperId, agent: 'shell', cpus: 2, memory: '2g', idleStopMinutes },
		{ runtime, scheduler, log, capacity, presence }
	);
	lifecycle.start();
	return lifecycle;
}

async function step(name, action) {
	const started = Date.now();
	try {
		const detail = await action();
		results.push({ name, ok: true });
		console.log(`PASS  ${name} (${Date.now() - started} ms)${detail ? ` - ${detail}` : ''}`);
	} catch (error) {
		results.push({ name, ok: false });
		console.log(`FAIL  ${name} (${Date.now() - started} ms)`);
		console.log(`      ${error instanceof Error ? error.message : String(error)}`);
	}
}

function expect(condition, message) {
	if (!condition) throw new Error(message);
}

async function statusOf(name) {
	return (await runtime.list()).find(entry => entry.name === name)?.status;
}

async function rejectionOf(promise) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error('expected a rejection, but it resolved');
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitFor(description, predicate, timeoutMs, pollMs = 1000) {
	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		if (await predicate()) return Date.now() - started;
		await sleep(pollMs);
	}
	throw new Error(`timed out after ${timeoutMs} ms waiting for: ${description}`);
}

function bash(mounts, script) {
	return ({ sandbox, signal }) =>
		runtime.exec({
			sandbox,
			command: ['bash', '-s'],
			cwd: mounts.toSandboxPath(mounts.sandboxMounts()[0].hostPath, 'cwd'),
			stdin: script,
			signal,
		});
}

async function main() {
	console.log(
		`Live check of the sandbox lifecycle${dryRun ? ' (DRY RUN against the mock)' : ''}; wrappers ${wrapperA}/${wrapperB}/${wrapperC}; temp ${root}`
	);
	const nameA = nameOf(wrapperA, runA);
	const mountsA = makeMounts('a');
	const lifecycleA = newLifecycle(wrapperA);

	await step('first assignment creates the sandbox (explicit 2 cpus / 2g, two mounts) and runs a step', async () => {
		expect((await statusOf(nameA)) === undefined, `${nameA} exists before the first assignment`);
		const started = Date.now();
		const result = await lifecycleA.runStep(
			{ executionId: runA, mounts: mountsA },
			bash(
				mountsA,
				'echo from-step-1 > "$PWD/step1.txt"\nmkdir -p /home/agent && echo vm-local > /home/agent/marker.txt\n'
			)
		);
		expect(result.exitCode === 0, `exit ${result.exitCode}: ${result.stderr}`);
		const info = (await runtime.list()).find(entry => entry.name === nameA);
		expect(info !== undefined, `${nameA} is not in sbx ls after the first assignment`);
		expect(info.cpus === 2 && info.memoryMib === 2048, `limits not applied: ${JSON.stringify(info)}`);
		expect(
			fs.readFileSync(path.join(mountsA.sandboxMounts()[0].hostPath, 'step1.txt'), 'utf8').trim() ===
				'from-step-1',
			'the file written by the step is not on the host'
		);
		return `created and stepped in ${Date.now() - started} ms; ls: ${JSON.stringify(info)}`;
	});

	await step(
		`wrapper idle timer (idleStopMinutes=${IDLE_MINUTES}) STOPS the sandbox, does not remove it`,
		async () => {
			const elapsed = await waitFor(
				'the lifecycle reports the sandbox stopped',
				() => lifecycleA.current()?.status === 'stopped',
				45_000,
				500
			);
			expect(
				logLines.some(line => line.includes(`"${nameA}" stopped (idle for ${IDLE_MINUTES} min)`)),
				'the stop was not logged as the wrapper idle stop'
			);
			const status = await statusOf(nameA);
			expect(
				status === 'stopped',
				`sbx ls reports ${JSON.stringify(status)}, expected "stopped" (a missing sandbox means it was removed)`
			);
			return `stopped by the wrapper timer after ${elapsed} ms (sbx's own idle stop is ~30 s)`;
		}
	);

	await step('next assignment restarts the stopped sandbox; VM-local files survived the stop', async () => {
		const result = await lifecycleA.runStep(
			{ executionId: runA, mounts: mountsA },
			bash(mountsA, 'cat /home/agent/marker.txt\ncat "$PWD/step1.txt"\n')
		);
		expect(result.exitCode === 0, `exit ${result.exitCode}: ${result.stderr}`);
		expect(
			result.stdout.includes('vm-local') && result.stdout.includes('from-step-1'),
			`unexpected output ${JSON.stringify(result.stdout)}`
		);
		expect(
			logLines.some(line => line.includes(`"${nameA}" restarted`)),
			'the restart was not logged'
		);
		expect((await statusOf(nameA)) === 'running', 'the sandbox is not running after the restart');
		return 'restarted, home and workspace files intact';
	});

	await step(
		'step timeout: step failed with a timeout error, sandbox stopped, its process dies with the VM',
		async () => {
			await waitFor(
				'the idle timer to stop the sandbox after the previous step',
				() => lifecycleA.current()?.status === 'stopped',
				45_000,
				500
			);
			const error = await rejectionOf(
				lifecycleA.runStep(
					{ executionId: runA, mounts: mountsA, timeoutMs: 4000 },
					bash(mountsA, 'sleep 12\necho late > "$PWD/late.txt"\n')
				)
			);
			expect(error?.kind === 'timeout', `expected a timeout SandboxError, got ${error?.kind}: ${error?.message}`);
			const status = await statusOf(nameA);
			expect(
				status === 'stopped',
				`sbx ls reports ${JSON.stringify(status)} after the timeout, expected "stopped"`
			);
			const result = await lifecycleA.runStep(
				{ executionId: runA, mounts: mountsA },
				bash(mountsA, 'sleep 11\nls "$PWD"\n')
			);
			expect(result.exitCode === 0, `exit ${result.exitCode}: ${result.stderr}`);
			expect(
				!result.stdout.includes('late.txt'),
				'late.txt exists: the timed-out process kept running in the VM'
			);
			return 'timeout error, VM stopped, late.txt never written, next step restarted the VM';
		}
	);

	await step('a second concurrent run on the same worker is refused; nothing is created for it', async () => {
		const error = await rejectionOf(lifecycleA.beginStep(runB, makeMounts('b')));
		expect(error?.kind === 'worker-busy', `expected worker-busy, got ${error?.kind}: ${error?.message}`);
		expect((await statusOf(nameOf(wrapperA, runB))) === undefined, 'a sandbox was created for the refused run');
		return error.message.slice(0, 90);
	});

	await step(
		'leftover list shows the sandbox; remove is refused while run and wrapper are alive and for foreign names',
		async () => {
			const listed = (await leftovers.list()).find(entry => entry.name === nameA);
			expect(listed !== undefined, 'leftover list does not show the sandbox');
			expect(
				listed.wrapperId === wrapperA && listed.executionId === runA,
				`wrong identity ${JSON.stringify(listed)}`
			);
			expect(listed.ageMs !== undefined && listed.ageMs > 0, `age not reported: ${JSON.stringify(listed)}`);
			const alive = await rejectionOf(leftovers.remove(nameA));
			expect(alive?.kind === 'removal-refused', `expected removal-refused, got ${alive?.kind}`);
			const foreign = await rejectionOf(leftovers.remove('default'));
			expect(
				foreign?.kind === 'removal-refused',
				`expected removal-refused for a foreign name, got ${foreign?.kind}`
			);
			expect((await statusOf(nameA)) !== undefined, 'the sandbox disappeared although the removal was refused');
			return `listed (${listed.status}, age ${Math.round(listed.ageMs / 1000)} s); both refusals held`;
		}
	);

	await step('end-of-run removes the sandbox; a second end-of-run is a no-op; a late step is refused', async () => {
		await lifecycleA.endRun(runA, 'completed');
		expect((await statusOf(nameA)) === undefined, `${nameA} is still listed after end-of-run`);
		await lifecycleA.endRun(runA, 'completed');
		const late = await rejectionOf(lifecycleA.beginStep(runA, mountsA));
		expect(late?.kind === 'run-ended', `expected run-ended, got ${late?.kind}`);
		expect((await statusOf(nameA)) === undefined, 'a late step re-created the sandbox');
		return 'removed once, second event harmless, late step refused';
	});

	const nameD = nameOf(wrapperB, runD);
	await step(
		'a wrapper that exits STOPS its sandbox and never removes it; leftover remove then succeeds',
		async () => {
			const lifecycleB = newLifecycle(wrapperB, 5);
			const mountsB = makeMounts('d');
			const result = await lifecycleB.runStep({ executionId: runD, mounts: mountsB }, bash(mountsB, 'echo hi\n'));
			expect(result.exitCode === 0, `exit ${result.exitCode}: ${result.stderr}`);
			expect(presence.isWrapperAlive(wrapperB), 'presence does not show the running wrapper');
			const refused = await rejectionOf(leftovers.remove(nameD));
			expect(
				refused?.kind === 'removal-refused',
				`expected removal-refused while the wrapper lives, got ${refused?.kind}`
			);
			await lifecycleB.shutdown();
			expect(
				(await statusOf(nameD)) === 'stopped',
				`expected stopped after shutdown, got ${await statusOf(nameD)}`
			);
			expect(!presence.isWrapperAlive(wrapperB), 'presence still shows the wrapper after shutdown');
			await leftovers.remove(nameD);
			expect((await statusOf(nameD)) === undefined, `${nameD} still listed after the explicit removal`);
			return 'stopped on shutdown, kept, then removed only by the explicit command';
		}
	);

	const nameE = nameOf(wrapperC, runE);
	await step(
		'reapOwn at wrapper start stops its own stale running sandbox (crash case) without removing it',
		async () => {
			const crashed = newLifecycle(wrapperC, 5);
			await crashed.beginStep(runE, makeMounts('e'));
			expect((await statusOf(nameE)) === 'running', 'the sandbox of the "crashed" wrapper is not running');
			// The wrapper "crashes": no shutdown, no end-of-run. A new process of the same wrapper id starts.
			const result = await leftovers.reapOwn(wrapperC, new Set());
			expect(
				result.stopped.some(entry => entry.name === nameE),
				`not reaped: ${JSON.stringify(result)}`
			);
			expect((await statusOf(nameE)) === 'stopped', `expected stopped, got ${await statusOf(nameE)}`);
			presence.withdraw(wrapperC);
			await leftovers.remove(nameE);
			expect((await statusOf(nameE)) === undefined, `${nameE} still listed after the explicit removal`);
			return 'stopped by reapOwn, removed only by the explicit command';
		}
	);
}

try {
	await main();
} catch (error) {
	results.push({ name: 'setup', ok: false });
	console.log(`FAIL  setup: ${error instanceof Error ? error.message : String(error)}`);
} finally {
	for (const name of [
		nameOf(wrapperA, runA),
		nameOf(wrapperA, runB),
		nameOf(wrapperB, runD),
		nameOf(wrapperC, runE),
	]) {
		try {
			await runtime.remove(name);
			console.log(`cleanup: removed ${name}`);
		} catch (error) {
			if (error?.kind !== 'not-found') {
				console.log(
					`CLEANUP FAILED for ${name}: ${error instanceof Error ? error.message : String(error)}. Remove it with: sbx rm --force ${name}`
				);
			}
		}
	}
	fs.rmSync(root, { recursive: true, force: true });
}

const failed = results.filter(result => !result.ok);
console.log(
	`${results.length - failed.length}/${results.length} steps passed${failed.length ? `; failed: ${failed.map(f => f.name).join('; ')}` : ''}`
);
if (failed.length > 0) console.log(`Lifecycle log:\n${logLines.join('\n')}`);
process.exit(failed.length === 0 ? 0 : 1);
