/**
 * GATED live EXPERIMENT (not a pass/fail check): what can code in a sandbox plant in a pool slot that later runs on the HOST, and what does
 * the production hardening (packages/extension-points/src/HardenedGit.ts, used by GitFolderProbe) stop? Never part of `npm test`,
 * `npm run check` or CI. No flow daemon is started. Creates ONE sandbox `flow-sbx-live-slot-<random>` (image from SLOT_IMAGE, default
 * flow-sandbox:m6) whose primary read/write mount is a throw-away git clone standing in for a pool slot.
 *
 * From inside the VM the agent plants, in the slot's `.git` and working tree, one harmless script `plant.sh` (it only writes a canary file
 * `CANARY-<vector>.txt` in the temp tree) and wires it as: core.fsmonitor, a post-checkout hook, a clean/smudge filter driver
 * (`filter.plant.*` with a `.gitattributes` line), core.sshCommand (with an ssh remote), credential.helper (with an http remote whose
 * server answers 401), and, in a second stage, core.hooksPath. Then the HOST runs, one by one, in the slot:
 *   - plain `git status` (the unhardened call: control),
 *   - the REAL production probe `GitFolderProbe.inspect` (reads through hardenedGit: fsmonitor off, hooks off, no optional locks),
 *   - `hardenedGit(...)` in MUTATING mode (only fsmonitor off) for `checkout -f`, `fetch` over ssh and `fetch` over http,
 * and reports, after every run, which canaries appeared. A canary = code written by the sandbox ran on the host.
 * Everything is removed in a `finally`. No setting, policy or network rule is touched (the 401 server listens on host loopback).
 *
 * Usage: SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/PoolSlotLiveCheck.mjs
 * Output: JSON on stdout and in .claude/temp/sbx-0-51/poolslot-results.json.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { hardenedGit } from '../../../extension-points/src/HardenedGit.ts';
import { GitFolderProbe } from '../../../flow-cli/src/workspace/GitFolderProbe.ts';
import { PathTranslator } from '../../src/PathTranslator.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';

if (process.env.SBX_LIVE !== '1') {
	console.error('PoolSlotLiveCheck refused to run: set SBX_LIVE=1 to confirm that you want to create and remove a real sandbox.');
	process.exit(2);
}
if (process.env.SBX_MOCK_PATH) {
	console.error('PoolSlotLiveCheck refused to run: SBX_MOCK_PATH is set, the result would not be live.');
	process.exit(2);
}

const suffix = randomBytes(3).toString('hex');
const sandbox = `flow-sbx-live-slot-${suffix}`;
const image = process.env.SLOT_IMAGE ?? 'flow-sandbox:m6';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-slot-${suffix}-`)));
const origin = path.join(root, 'origin');
const slot = path.join(root, 'pool', 'slot-1');
const meta = path.join(root, 'meta');
const report = { sandbox, image, platform: `${process.platform} ${os.release()}`, git: undefined, hostRuns: [] };
const posix = p => `/${p[0].toLowerCase()}${p.slice(2).replaceAll('\\', '/')}`;
const VECTORS = ['fsmonitor', 'hook-post-checkout', 'hookspath', 'filter-clean', 'filter-smudge', 'sshcommand', 'credential'];

function git(args, cwd, extraEnv = {}) {
	const result = spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		windowsHide: true,
		env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
		timeout: 30_000,
	});
	return { status: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim().slice(0, 200) };
}
const canaries = () => VECTORS.filter(vector => fs.existsSync(path.join(root, `CANARY-${vector}.txt`)));
function clearCanaries() {
	for (const vector of VECTORS) fs.rmSync(path.join(root, `CANARY-${vector}.txt`), { force: true });
}

/** One host action; the canaries it produced are the evidence. */
async function hostRun(label, action) {
	clearCanaries();
	let outcome;
	try {
		outcome = await action();
	} catch (error) {
		outcome = { error: String(error) };
	}
	const ran = canaries();
	report.hostRuns.push({ label, outcome, plantedCodeRan: ran });
	console.log(`${ran.length === 0 ? 'clean ' : 'RAN   '} ${label}${ran.length === 0 ? '' : ` -> ${ran.join(', ')}`}`);
	clearCanaries();
}

// ---- a clone standing in for a pool slot, and an http server that answers 401 (so that git asks the credential helper)
fs.mkdirSync(origin, { recursive: true });
fs.mkdirSync(meta, { recursive: true });
fs.mkdirSync(path.dirname(slot), { recursive: true });
git(['init', '-q'], origin);
fs.writeFileSync(path.join(origin, 'a.txt'), 'one\n');
git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'add', '-A'], origin);
git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], origin);
git(['clone', '-q', origin, slot], root);
report.git = git(['--version'], root).stdout;
const authServer = http.createServer((request, response) => {
	response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="x"' });
	response.end();
});
await new Promise(resolve => authServer.listen(0, '127.0.0.1', resolve));
const authPort = authServer.address().port;

const runtime = new SbxCliRuntime();
const translator = new PathTranslator({ workspaceDir: slot, workspaceMetaDir: meta, platform: process.platform });

try {
	console.log(`sandbox ${sandbox}, image ${image}, ${report.git}`);
	await runtime.create({
		name: sandbox,
		agent: 'shell',
		image,
		pull: 'never',
		mounts: [{ hostPath: slot }, { hostPath: meta }],
		cpus: 2,
		memory: '2g',
	});
	const slotVm = translator.toSandbox(slot, 'slot');
	const plant = `${posix(slot)}/.git/plant.sh`;
	const canaryBase = posix(root);
	// The planted program: records that it ran (a canary file), passes data through for the filters, answers nothing otherwise.
	const plantScript = [
		'#!/bin/sh',
		`echo "planted by the sandbox: $*" > "${canaryBase}/CANARY-$1.txt"`,
		'case "$1" in filter-clean|filter-smudge) cat;; esac',
		'exit 0',
	].join('\n');
	const plantInVm = [
		'set +e',
		`cd '${slotVm}'`,
		`cat > .git/plant.sh <<'PLANT'\n${plantScript}\nPLANT`,
		`git config core.fsmonitor 'sh ${plant} fsmonitor'`,
		`printf '#!/bin/sh\\nsh ${plant} hook-post-checkout\\n' > .git/hooks/post-checkout && chmod +x .git/hooks/post-checkout`,
		`git config filter.plant.clean 'sh ${plant} filter-clean'`,
		`git config filter.plant.smudge 'sh ${plant} filter-smudge'`,
		`printf 'a.txt filter=plant\\n' > .gitattributes`,
		`git config core.sshCommand 'sh ${plant} sshcommand'`,
		`git remote add origin-ssh ssh://git@127.0.0.1:9/repo.git`,
		`git config credential.helper '!sh ${plant} credential'`,
		`git remote add origin-http http://127.0.0.1:${authPort}/repo.git`,
		// a modified tracked file, so that status has something to filter and checkout -f something to rewrite
		`echo two >> a.txt`,
		'echo "planted: $?"',
		'git config --local --list | grep -c "fsmonitor\\|filter\\|sshcommand\\|credential"',
	].join('\n');
	const planted = await runtime.exec({ sandbox, command: ['bash', '-s'], stdin: plantInVm });
	report.vmPlant = { exitCode: planted.exitCode, output: planted.stdout + planted.stderr };
	report.hostSeesPlantedConfig = fs.readFileSync(path.join(slot, '.git', 'config'), 'utf8').includes('fsmonitor');
	report.hostSeesPlantScript = fs.existsSync(path.join(slot, '.git', 'plant.sh'));

	// ---- host side, stage 1 (no core.hooksPath planted yet)
	await hostRun('control, UNHARDENED: plain `git status`', () => git(['status', '--porcelain'], slot));
	await hostRun('production probe GitFolderProbe.inspect (hardenedGit reading)', async () => new GitFolderProbe().inspect(slot));
	const mutate = (args) => {
		const command = hardenedGit(args, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
		return git(command.args, slot, command.env);
	};
	await hostRun('hardenedGit MUTATING: checkout -f HEAD -- .', () => mutate(['checkout', '-f', 'HEAD', '--', '.']));
	await hostRun('hardenedGit MUTATING: fetch origin-ssh', () => mutate(['fetch', 'origin-ssh']));
	await hostRun('hardenedGit MUTATING: fetch origin-http (server answers 401)', () => mutate(['fetch', 'origin-http']));

	// ---- stage 2: the VM resets core.hooksPath to a directory it controls
	const stage2 = await runtime.exec({
		sandbox,
		command: ['bash', '-s'],
		stdin: [
			'set +e',
			`cd '${slotVm}'`,
			'mkdir -p .git/evil-hooks',
			`printf '#!/bin/sh\\nsh ${plant} hookspath\\n' > .git/evil-hooks/post-checkout && chmod +x .git/evil-hooks/post-checkout`,
			// A Windows-form path: git.exe reads "/c/..." as a path on the current drive, so the POSIX form would plant nothing.
			`git config core.hooksPath '${slot.replaceAll('\\', '/')}/.git/evil-hooks'`,
			'git config --local core.hooksPath',
		].join('\n'),
	});
	report.vmStage2 = stage2.stdout + stage2.stderr;
	await hostRun('stage 2, production probe GitFolderProbe.inspect (hooksPath planted)', async () => new GitFolderProbe().inspect(slot));
	await hostRun('stage 2, hardenedGit MUTATING: checkout -f HEAD -- . (hooksPath planted)', () => mutate(['checkout', '-f', 'HEAD', '--', '.']));
	const reading = args => {
		const command = hardenedGit(args, { reading: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
		return git(command.args, slot, command.env);
	};
	await hostRun('stage 2, hardenedGit READING: checkout -f HEAD -- . (hooks disabled by the NUL hooksPath)', () => reading(['checkout', '-f', 'HEAD', '--', '.']));
	await hostRun('stage 2, control, UNHARDENED: plain `git checkout -f HEAD -- .`', () => git(['checkout', '-f', 'HEAD', '--', '.'], slot));

	const ranByHardenedReading = report.hostRuns.filter(run => run.label.includes('production probe')).flatMap(run => run.plantedCodeRan);
	report.verdict = {
		plainStatusRanPlantedCode: report.hostRuns[0].plantedCodeRan,
		productionProbeRanPlantedCode: ranByHardenedReading,
	};
} catch (error) {
	report.error = error instanceof Error ? error.stack : String(error);
	process.exitCode = 1;
} finally {
	authServer.close();
	try {
		await runtime.remove(sandbox);
		console.log(`cleanup: sandbox ${sandbox} removed`);
	} catch (error) {
		console.error(`CLEANUP FAILED: run "sbx rm --force ${sandbox}" by hand: ${error.message}`);
		process.exitCode = 1;
	}
	const output = path.resolve(import.meta.dirname, '..', '..', '..', '..', '.claude', 'temp', 'sbx-0-51');
	fs.mkdirSync(output, { recursive: true });
	fs.writeFileSync(path.join(output, 'poolslot-results.json'), JSON.stringify(report, null, 2));
	console.log(JSON.stringify({ ...report, hostRuns: undefined }, null, 2));
	try {
		fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
	} catch (error) {
		console.error(`The temporary tree ${root} could not be removed (${error.code}): remove it by hand.`);
	}
}
