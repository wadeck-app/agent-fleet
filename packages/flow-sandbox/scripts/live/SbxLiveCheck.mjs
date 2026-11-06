#!/usr/bin/env node

/**
 * GATED live check: reproduces the PoC commands against the REAL sbx through SbxCliRuntime.
 * Never part of `npm test`, `npm run check` or CI.
 *
 * It creates ONE sandbox (name `flow-sbx-live-<random>`), adds sandbox-scoped network rules and secrets to
 * that sandbox only, and removes everything in a `finally`. It never changes a setting or a machine-wide
 * policy. Do not run it while another session relies on sbx being idle: it uses CPU/RAM for a minute or two.
 *
 * Usage (from the repository root):
 *   SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/SbxLiveCheck.mjs
 *
 * Env:
 *   SBX_LIVE=1             required; without it the script refuses to run.
 *   SBX_PATH               sbx executable when it is not in the default install directory.
 *   SBX_LIVE_ACCEPT_SSH=1  accept ssh agent forwarding in the prerequisite report (it is only reported here).
 *   SBX_LIVE_DRY_RUN=1     run against the mock (SBX_MOCK_PATH + SBX_MOCK_STATE_DIR) to test this script itself.
 *                          Without it, a set SBX_MOCK_PATH is refused so a mock can never pass for the real tool.
 *
 * Exit code: 0 all steps passed, 1 a step failed, 2 refused to run.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { PathTranslator } from '../../src/PathTranslator.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';
import { SbxPrerequisiteCheck } from '../../src/SbxPrerequisiteCheck.ts';

function refuse(message) {
	console.error(`SbxLiveCheck refused to run: ${message}`);
	process.exit(2);
}

if (process.env.SBX_LIVE !== '1') {
	refuse('set SBX_LIVE=1 to confirm that you want to create and remove a real sandbox on this machine.');
}
const dryRun = process.env.SBX_LIVE_DRY_RUN === '1';
if (!dryRun && process.env.SBX_MOCK_PATH) {
	refuse(
		'SBX_MOCK_PATH is set, so the runtime would talk to the mock and the result would not be live. Unset it (or set SBX_LIVE_DRY_RUN=1 to test this script against the mock).'
	);
}

const suffix = randomBytes(3).toString('hex');
const sandbox = `flow-sbx-live-${suffix}`;
const root = fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-live-${suffix}-`));
const workspace = path.join(root, 'ws');
const meta = path.join(root, 'ws.meta');
fs.mkdirSync(workspace);
fs.mkdirSync(path.join(meta, 'outputs'), { recursive: true });

const runtime = new SbxCliRuntime();
const translator = new PathTranslator({ workspaceDir: workspace, workspaceMetaDir: meta, platform: process.platform });
const servers = [];
const results = [];

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

async function execBash(script, extra = {}) {
	return runtime.exec({
		sandbox,
		command: ['bash', '-s'],
		cwd: translator.toSandbox(workspace, 'cwd'),
		stdin: script,
		...extra,
	});
}

async function hostServer(handler) {
	const server = http.createServer(handler);
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
	servers.push(server);
	return server.address().port;
}

async function main() {
	console.log(
		`Live check of sbx through SbxCliRuntime${dryRun ? ' (DRY RUN against the mock)' : ''}; sandbox ${sandbox}; temp ${root}`
	);

	const report = await new SbxPrerequisiteCheck(runtime, {
		acceptSshAgentForwarding: process.env.SBX_LIVE_ACCEPT_SSH === '1',
	}).run();
	for (const finding of report.findings) console.log(`      [${finding.severity}] ${finding.id}: ${finding.message}`);
	if (
		report.findings.some(
			f => f.id === 'binary-missing' || f.id === 'version-mismatch' || f.id === 'version-unreadable'
		)
	) {
		throw new Error('The prerequisite check found no usable pinned sbx; nothing else can run.');
	}
	const policyBefore = await runtime.readNetworkPolicy();

	await step('create with two mounts, explicit limits', async () => {
		const started = Date.now();
		await runtime.create({
			name: sandbox,
			agent: 'shell',
			mounts: [{ hostPath: workspace }, { hostPath: meta }],
			cpus: 2,
			memory: '2g',
		});
		const [info] = (await runtime.list()).filter(entry => entry.name === sandbox);
		expect(info !== undefined, 'the sandbox is not in `sbx ls --json` after create');
		expect(info.cpus === 2 && info.memoryMib === 2048, `limits not applied: ${JSON.stringify(info)}`);
		return `created in ${Date.now() - started} ms, ls entry ${JSON.stringify(info)}`;
	});

	await step('exec with env, stdin script and translated cwd; file reaches the host', async () => {
		const result = await execBash('echo "VAR=$FLOW_LIVE_VAR"\npwd\necho hello > "$PWD/live.txt"\n', {
			env: { FLOW_LIVE_VAR: 'with space = and equals' },
		});
		expect(result.exitCode === 0, `exit ${result.exitCode}: ${result.stderr}`);
		expect(result.stdout.includes('VAR=with space = and equals'), `env not seen: ${JSON.stringify(result.stdout)}`);
		expect(
			result.stdout.includes(translator.toSandbox(workspace, 'cwd')),
			`cwd not applied: ${JSON.stringify(result.stdout)}`
		);
		expect(
			fs.readFileSync(path.join(workspace, 'live.txt'), 'utf8').trim() === 'hello',
			'the file written in the sandbox is not on the host'
		);
	});

	await step('exit code and stderr are propagated', async () => {
		const result = await runtime.exec({ sandbox, command: ['bash', '-c', 'echo out; echo err >&2; exit 7'] });
		expect(result.exitCode === 7 && result.stdout === 'out\n' && result.stderr === 'err\n', JSON.stringify(result));
	});

	await step('output streams while the command runs', async () => {
		const seen = [];
		const started = Date.now();
		await runtime.exec({
			sandbox,
			command: ['bash', '-c', 'for i in 1 2 3; do echo l$i; sleep 1; done'],
			onStdout: text => seen.push(Date.now() - started),
		});
		const total = Date.now() - started;
		expect(seen.length >= 2 && seen[0] + 1000 < total, `chunks at ${seen.join(', ')} ms of ${total} ms`);
		return `chunks at ${seen.join(', ')} ms of ${total} ms`;
	});

	await step('host abort does not stop the process inside; stop does', async () => {
		// The bracket keeps the probe from matching its own command line: `bash -c "pgrep -f 'sleep 300' >/dev/null"` has the
		// pattern text in the bash process args, so a plain pattern always finds that bash (observed: exit 0 with no sleep at all).
		const probe = ['bash', '-c', "pgrep -f '[s]leep 300' >/dev/null"];
		const control = await runtime.exec({ sandbox, command: probe });
		expect(
			control.exitCode !== 0,
			'the probe matches although no sleep runs (it sees itself): the check would prove nothing'
		);
		const controller = new AbortController();
		const pending = runtime.exec({ sandbox, command: ['bash', '-c', 'sleep 300'], signal: controller.signal });
		setTimeout(() => controller.abort(), 2000);
		const error = await pending.then(
			() => undefined,
			e => e
		);
		expect(error?.kind === 'aborted', `expected an aborted error, got ${String(error)}`);
		const alive = await runtime.exec({ sandbox, command: probe });
		expect(alive.exitCode === 0, 'the sleep did not survive the host-side abort (documented behaviour changed)');
		await runtime.stop(sandbox);
		// exec restarts a stopped sandbox, so this probe runs after the restart: a surviving sleep would still be listed.
		const afterStop = await runtime.exec({ sandbox, command: probe });
		expect(afterStop.exitCode !== 0, 'the sleep survived stop');
	});

	await step('stop and restart keep files under the home directory', async () => {
		await runtime.exec({ sandbox, command: ['bash', '-c', 'echo kept > /home/agent/live-kept.txt'] });
		await runtime.stop(sandbox);
		const stopped = (await runtime.list()).find(entry => entry.name === sandbox);
		expect(stopped?.status === 'stopped', `status after stop: ${stopped?.status}`);
		await runtime.start(sandbox);
		const result = await runtime.exec({ sandbox, command: ['cat', '/home/agent/live-kept.txt'] });
		expect(result.stdout.trim() === 'kept', JSON.stringify(result));
		return `status after stop: ${stopped?.status}`;
	});

	await step('copy a directory in and back out', async () => {
		const source = path.join(root, 'cp-source');
		fs.mkdirSync(source);
		fs.writeFileSync(path.join(source, 'a.txt'), 'copied');
		await runtime.copyIn({ sandbox, hostPath: source, sandboxPath: '/home/agent/cp-store' });
		const back = path.join(root, 'cp-back');
		await runtime.copyOut({ sandbox, sandboxPath: '/home/agent/cp-store', hostPath: back });
		const copied = path.join(back, 'a.txt');
		expect(
			fs.existsSync(copied) && fs.readFileSync(copied, 'utf8') === 'copied',
			`copy-out layout differs: ${fs.existsSync(back) ? fs.readdirSync(back).join(',') : 'no directory'}`
		);
	});

	await step('a sandbox-scoped allow rule opens one host port and is removed again', async () => {
		const port = await hostServer((request, response) => response.end('host-says-hello'));
		const probe = ['bash', '-c', `curl -s -m 10 http://host.docker.internal:${port}/`];
		await runtime.allowNetwork({ sandbox, resources: [`localhost:${port}`] });
		const open = await runtime.exec({ sandbox, command: probe });
		expect(open.stdout === 'host-says-hello', `with the rule: ${JSON.stringify(open)}`);
		await runtime.removeNetwork({ sandbox, resources: [`localhost:${port}`] });
		const closed = await runtime.exec({ sandbox, command: probe });
		expect(
			closed.stdout !== 'host-says-hello',
			`after removing the rule the host is still reachable: ${JSON.stringify(closed)}`
		);
	});

	await step('a sandbox-scoped secret is swapped in by the proxy and never seen in the sandbox', async () => {
		const secret = `live-secret-${randomBytes(6).toString('hex')}`;
		const placeholder = `flow-live-ph-${randomBytes(6).toString('hex')}`;
		let received = '';
		const port = await hostServer((request, response) => {
			received = request.headers.authorization ?? '';
			response.statusCode = received === `Bearer ${secret}` ? 200 : 403;
			response.end('ok');
		});
		await runtime.allowNetwork({ sandbox, resources: [`localhost:${port}`] });
		await runtime.setSecret({
			sandbox,
			hosts: ['localhost'],
			envVar: 'FLOW_LIVE_TOKEN',
			placeholder,
			valueCommand: `echo ${secret}`,
		});
		const env = { FLOW_LIVE_TOKEN: placeholder };
		const call = await runtime.exec({
			sandbox,
			env,
			command: [
				'bash',
				'-c',
				`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $FLOW_LIVE_TOKEN" http://host.docker.internal:${port}/`,
			],
		});
		expect(call.stdout === '200', `status ${call.stdout} (server saw "${received}")`);
		const visible = await runtime.exec({ sandbox, env, command: ['printenv', 'FLOW_LIVE_TOKEN'] });
		expect(
			visible.stdout.trim() === placeholder && !visible.stdout.includes(secret),
			'the sandbox sees something other than the placeholder'
		);
		await runtime.removeSecret({ sandbox, placeholder });
		await runtime.removeNetwork({ sandbox, resources: [`localhost:${port}`] });
	});

	await step('no machine-wide network rule was added by any of the above', async () => {
		const policyAfter = await runtime.readNetworkPolicy();
		expect(
			policyAfter.mode === policyBefore.mode &&
				policyAfter.allowedResourceCount === policyBefore.allowedResourceCount,
			`before ${JSON.stringify(policyBefore)}, after ${JSON.stringify(policyAfter)}`
		);
	});
}

try {
	await main();
} catch (error) {
	results.push({ name: 'setup', ok: false });
	console.log(`FAIL  setup: ${error instanceof Error ? error.message : String(error)}`);
} finally {
	for (const server of servers) server.close();
	try {
		await runtime.remove(sandbox);
		const left = (await runtime.list()).some(entry => entry.name === sandbox);
		console.log(
			left
				? `CLEANUP FAILED: sandbox ${sandbox} still listed; remove it with: sbx rm --force ${sandbox}`
				: `cleanup: sandbox ${sandbox} removed`
		);
	} catch (error) {
		if (error?.kind === 'not-found') console.log(`cleanup: sandbox ${sandbox} was never created`);
		else
			console.log(
				`CLEANUP FAILED for ${sandbox}: ${error instanceof Error ? error.message : String(error)}. Remove it with: sbx rm --force ${sandbox}`
			);
	}
	fs.rmSync(root, { recursive: true, force: true });
}

const failed = results.filter(result => !result.ok);
console.log(
	`${results.length - failed.length}/${results.length} steps passed${failed.length ? `; failed: ${failed.map(f => f.name).join('; ')}` : ''}`
);
console.log(
	'Next: re-run scripts/CaptureSbxFixtures.mjs and review `git diff packages/flow-sandbox/fixtures` for drift.'
);
process.exit(failed.length === 0 ? 0 : 1);
