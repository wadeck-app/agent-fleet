/**
 * GATED live PROBE (not a pass/fail check): runs ONE bash script inside ONE throwaway sandbox of an image and prints what it said.
 * Never part of `npm test`, `npm run check` or CI. Creates `flow-sbx-live-probe-<random>` (two mounts like a run: a workspace and a
 * `.meta`, both empty temporary directories), removes it and its temporary tree in a `finally`. Changes no setting and no policy,
 * opens no network rule, makes no model call and passes no secret.
 *
 * Usage: SBX_LIVE=1 VM_PROBE_SCRIPT=<path of a bash script> [VM_PROBE_IMAGE=flow-sandbox:m6] \
 *        node --import tsx packages/flow-sandbox/scripts/live/VmProbeLiveCheck.mjs
 * The script runs with `bash -s` (stdin), as the agent user, with the workspace as its cwd. stdout, stderr and the exit code are printed.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PathTranslator } from '../../src/PathTranslator.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';

if (process.env.SBX_LIVE !== '1') {
	console.error(
		'VmProbeLiveCheck refused to run: set SBX_LIVE=1 to confirm that you want to create and remove a real sandbox.'
	);
	process.exit(2);
}
if (process.env.SBX_MOCK_PATH) {
	console.error('VmProbeLiveCheck refused to run: SBX_MOCK_PATH is set, the result would not be live.');
	process.exit(2);
}
const scriptPath = process.env.VM_PROBE_SCRIPT;
if (!scriptPath || !fs.existsSync(scriptPath)) {
	console.error('VmProbeLiveCheck refused to run: set VM_PROBE_SCRIPT to the path of an existing bash script.');
	process.exit(2);
}

const suffix = randomBytes(3).toString('hex');
const sandbox = `flow-sbx-live-probe-${suffix}`;
const image = process.env.VM_PROBE_IMAGE ?? 'flow-sandbox:m6';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-probe-${suffix}-`)));
const workspace = path.join(root, 'ws');
const meta = path.join(root, 'ws.meta');
fs.mkdirSync(workspace);
fs.mkdirSync(path.join(meta, 'outputs'), { recursive: true });

const runtime = new SbxCliRuntime();
const translator = new PathTranslator({ workspaceDir: workspace, workspaceMetaDir: meta, platform: process.platform });

try {
	console.log(`sandbox ${sandbox}, image ${image}`);
	const started = Date.now();
	await runtime.create({
		name: sandbox,
		agent: 'shell',
		image,
		pull: 'never',
		mounts: [{ hostPath: workspace }, { hostPath: meta }],
		cpus: 2,
		memory: '2g',
	});
	console.log(`created in ${Date.now() - started} ms`);
	const result = await runtime.exec({
		sandbox,
		command: ['bash', '-s'],
		stdin: fs.readFileSync(scriptPath, 'utf8'),
		cwd: translator.toSandbox(workspace, 'cwd'),
	});
	console.log(JSON.stringify(result, null, 2));
} catch (error) {
	console.error(`PROBE FAILED: ${error instanceof Error ? error.stack : String(error)}`);
	process.exitCode = 1;
} finally {
	try {
		await runtime.remove(sandbox);
		console.log(`cleanup: sandbox ${sandbox} removed`);
	} catch (error) {
		console.error(
			`CLEANUP FAILED: run "sbx rm --force ${sandbox}" by hand: ${error instanceof Error ? error.message : String(error)}`
		);
		process.exitCode = 1;
	}
	fs.rmSync(root, { recursive: true, force: true });
}
