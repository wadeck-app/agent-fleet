/**
 * GATED live EXPERIMENT (not a pass/fail check): what can code in a sandbox plant in a pool slot that later runs on the HOST, and what do
 * the production protections stop (packages/extension-points/src/HardenedGit.ts and HardenedGitFilters.ts, used by GitFolderProbe)?
 * Never part of `npm test`, `npm run check` or CI. No flow daemon is started. Creates ONE sandbox `flow-sbx-live-slot-<random>` (image from
 * SLOT_IMAGE, default flow-sandbox:m6) whose primary read/write mount is a throw-away git clone standing in for a pool slot.
 *
 * From inside the VM the agent plants, in the slot's `.git` and working tree, a harmless `plant.sh` that only writes a canary file
 * `CANARY-<vector>.txt` in the temp tree, and wires it as: filter drivers (config, `.gitattributes`, `.git/info/attributes`, worktree-scope
 * config, an included file, odd driver names, a name redefined from a user-level config like git-lfs), then fsmonitor, hooks, hooksPath,
 * smudge, sshCommand and credential.helper. The HOST then runs, each action TWICE (a stale index is recreated before every run):
 *   - plain `git status` (unhardened control),
 *   - the REAL production probe `GitFolderProbe.inspect`,
 *   - `hardenedGit(...)` in READING and MUTATING mode for checkout and fetch.
 * A canary = code written by the sandbox ran on the host. Counts are "ran in k of N runs". Last, the VM looks at what of the host user's
 * home directory is visible, and tries to create a file there as the agent and as root (a decoy file; no real file is touched or read).
 * Everything is removed in a `finally`. No setting, policy or network rule is touched (the 401 server listens on host loopback).
 *
 * Usage: SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/PoolSlotLiveCheck.mjs
 * Output: a summary on stdout and JSON in .claude/temp/sbx-0-51/poolslot-results.json.
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

const RUNS = 2;
const suffix = randomBytes(3).toString('hex');
const sandbox = `flow-sbx-live-slot-${suffix}`;
const image = process.env.SLOT_IMAGE ?? 'flow-sandbox:m6';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-slot-${suffix}-`)));
const origin = path.join(root, 'origin');
const slot = path.join(root, 'pool', 'slot-1');
const meta = path.join(root, 'meta');
const userLevelConfig = path.join(root, 'user-level-config');
const userLevelPlant = path.join(root, 'user-level-plant.sh');
const report = { sandbox, image, platform: `${process.platform} ${os.release()}`, git: undefined, runsPerCell: RUNS, results: [] };
const posix = p => `/${p[0].toLowerCase()}${p.slice(2).replaceAll('\\', '/')}`;

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
const canaryFiles = () => fs.readdirSync(root).filter(name => /^CANARY-.*\.txt$/.test(name));
const clearCanaries = () => canaryFiles().forEach(name => fs.rmSync(path.join(root, name), { force: true }));
const touchStale = () => {
	// Same content, new mtime: the index entry is stale, so status must hash the file again (through its clean filter).
	const now = new Date();
	for (const name of ['a.txt', 'b.txt']) fs.utimesSync(path.join(slot, name), now, now);
};

/**
 * One cell of the table: the same host action RUNS times. `expected` documents what the protection should do.
 * Records what ran in each run (canaries) and the error name, if the action threw.
 */
async function cell(group, label, action, expected) {
	const runs = [];
	for (let run = 0; run < RUNS; run++) {
		clearCanaries();
		touchStale();
		let error;
		try {
			await action();
		} catch (thrown) {
			error = `${thrown?.name ?? 'Error'}: ${String(thrown?.message ?? thrown).slice(0, 160)}`;
		}
		runs.push({ canaries: canaryFiles().map(name => name.slice(7, -4)), error });
	}
	clearCanaries();
	const ranIn = new Map();
	for (const { canaries } of runs) for (const canary of canaries) ranIn.set(canary, (ranIn.get(canary) ?? 0) + 1);
	const summary = [...ranIn].map(([canary, count]) => `${canary} in ${count}/${RUNS}`).join(', ') || 'nothing ran';
	const errors = [...new Set(runs.map(item => item.error).filter(Boolean))];
	report.results.push({ group, label, expected, summary, errors, runs });
	console.log(`${ranIn.size === 0 ? 'clean ' : 'RAN   '} [${group}] ${label}: ${summary}${errors.length ? ` | threw ${errors.join(' / ')}` : ''}`);
}

// ---- a clone standing in for a pool slot, and an http server that answers 401 (so that git asks the credential helper)
fs.mkdirSync(origin, { recursive: true });
fs.mkdirSync(meta, { recursive: true });
fs.mkdirSync(path.dirname(slot), { recursive: true });
git(['init', '-q'], origin);
fs.writeFileSync(path.join(origin, 'a.txt'), 'one\n');
fs.writeFileSync(path.join(origin, 'b.txt'), 'two\n');
git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'add', '-A'], origin);
git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], origin);
git(['clone', '-q', origin, slot], root);
fs.copyFileSync(path.join(slot, '.git', 'config'), path.join(slot, '.git', 'config.base'));
report.git = git(['--version'], root).stdout;
// The user-level configuration of this experiment (selected with GIT_CONFIG_GLOBAL): a trusted driver like git-lfs, and a name the slot redefines.
fs.writeFileSync(userLevelPlant, ['#!/bin/sh', `echo "user-level driver: $*" > "${posix(root)}/CANARY-$1.txt"`, 'cat'].join('\n'));
fs.writeFileSync(
	userLevelConfig,
	`[filter "lfsonly"]\n\tclean = sh ${posix(userLevelPlant)} global-lfsonly\n[filter "lfslike"]\n\tclean = sh ${posix(userLevelPlant)} global-lfslike\n`
);
const authServer = http.createServer((request, response) => {
	response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="x"' });
	response.end();
});
await new Promise(resolve => authServer.listen(0, '127.0.0.1', resolve));
const authPort = authServer.address().port;

const runtime = new SbxCliRuntime();
const translator = new PathTranslator({ workspaceDir: slot, workspaceMetaDir: meta, platform: process.platform });
const slotVm = () => translator.toSandbox(slot, 'slot');
const plant = `${posix(slot)}/.git/plant.sh`;
const plantScript = [
	'#!/bin/sh',
	`echo "planted by the sandbox: $*" > "${posix(root)}/CANARY-$1.txt"`,
	'case "$1" in filter-*) cat;; esac',
	'exit 0',
].join('\n');

/** Runs a bash script in the VM; the slot is reset to its baseline config first, then the stage plants its own. */
async function inVm(lines, reset = true) {
	const script = [
		'set +e',
		`cd '${slotVm()}'`,
		...(reset
			? [
					'cp .git/config.base .git/config',
					'rm -rf .gitattributes .git/info/attributes .git/config.worktree .git/extra.cfg .git/evil-hooks .git/hooks/post-checkout',
				]
			: []),
		...lines,
	].join('\n');
	const result = await runtime.exec({ sandbox, command: ['bash', '-s'], stdin: script });
	return result.stdout + result.stderr;
}

const probe = () => new GitFolderProbe().inspect(slot);
const plainStatus = () => git(['status', '--porcelain'], slot);
const hardened = (args, reading) => {
	const command = hardenedGit(args, { reading, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
	return git(command.args, slot, command.env);
};

try {
	console.log(`sandbox ${sandbox}, image ${image}, ${report.git}, ${RUNS} runs per cell`);
	await runtime.create({
		name: sandbox,
		agent: 'shell',
		image,
		pull: 'never',
		mounts: [{ hostPath: slot }, { hostPath: meta }],
		cpus: 2,
		memory: '2g',
	});
	await inVm([`cat > .git/plant.sh <<'PLANT'\n${plantScript}\nPLANT`], false);
	report.hostSeesPlantScript = fs.existsSync(path.join(slot, '.git', 'plant.sh'));

	// ================= 1. filter clean on a stale index FIRST: the case e7905266 closes
	await inVm([
		`git config filter.plant.clean 'sh ${plant} filter-clean'`,
		`printf 'a.txt filter=plant\\n' > .gitattributes`,
	]);
	await cell('filter clean, stale index', 'plain `git status` (control)', plainStatus, 'ran');
	await cell('filter clean, stale index', 'production probe GitFolderProbe.inspect', probe, 'blocked');

	// ================= 2. the same driver declared in other places
	await inVm([
		'git config extensions.worktreeConfig true',
		`git config --worktree filter.plantwt.clean 'sh ${plant} filter-clean-wt'`,
		`mkdir -p .git/info && printf 'a.txt filter=plantwt\\n' > .git/info/attributes`,
	]);
	await cell('driver in worktree-scope config + .git/info/attributes', 'plain `git status` (control)', plainStatus, 'ran');
	await cell('driver in worktree-scope config + .git/info/attributes', 'production probe', probe, 'blocked');

	await inVm([
		`printf '[filter "pinc"]\\n\\tclean = sh ${plant} filter-clean-include\\n' > .git/extra.cfg`,
		'git config include.path extra.cfg',
		`printf 'a.txt filter=pinc\\n' > .gitattributes`,
	]);
	await cell('driver in a file included by .git/config', 'plain `git status` (control)', plainStatus, 'ran');
	await cell('driver in a file included by .git/config', 'production probe', probe, 'blocked');

	// ================= 3. odd driver names planted from the sandbox
	const oddNames = [
		['a=b', 'a name with "="'],
		['dots.in.name', 'a name with dots'],
		['UPPER_Case', 'upper case'],
		['ünï', 'non-ASCII'],
		['back\\slash', 'a backslash'],
		['q"uote', 'a double quote'],
	];
	for (const [name, description] of oddNames) {
		const quoted = name.replaceAll("'", "'\\''");
		await inVm([
			`git config 'filter.${quoted}.clean' 'sh ${plant} filter-clean-odd'`,
			`printf 'a.txt filter=%s\\n' '${quoted}' > .gitattributes`,
		]);
		await cell(`odd driver name: ${description}`, 'plain `git status` (control: is the name a working vector?)', plainStatus, 'ran, or not applicable');
		await cell(`odd driver name: ${description}`, 'production probe', probe, name.includes('=') ? 'FilterDriverListingError' : 'blocked');
	}

	// ================= 4. a name redefined from the user's level config (git-lfs-like)
	process.env.GIT_CONFIG_GLOBAL = userLevelConfig;
	await inVm([
		`git config filter.lfslike.clean 'sh ${plant} filter-clean-redefined'`,
		`printf 'a.txt filter=lfslike\\nb.txt filter=lfsonly\\n' > .gitattributes`,
	]);
	await cell('name redefined from the user-level config', 'plain `git status` (control)', plainStatus, 'redefined runs, user-level-only runs');
	await cell('name redefined from the user-level config', 'production probe', probe, 'redefined blocked, user-level-only (trusted) runs');
	delete process.env.GIT_CONFIG_GLOBAL;

	// ================= 5. the rest of the table
	const rest = 'fsmonitor, hook, filters, sshCommand, credential.helper';
	await inVm([
		`git config core.fsmonitor 'sh ${plant} fsmonitor'`,
		`printf '#!/bin/sh\\nsh ${plant} hook-post-checkout\\n' > .git/hooks/post-checkout && chmod +x .git/hooks/post-checkout`,
		`git config filter.plant.smudge 'sh ${plant} filter-smudge'`,
		`git config filter.plant.clean 'sh ${plant} filter-clean'`,
		`printf 'a.txt filter=plant\\n' > .gitattributes`,
		`git config core.sshCommand 'sh ${plant} sshcommand'`,
		'git remote add origin-ssh ssh://git@127.0.0.1:9/repo.git',
		`git config credential.helper '!sh ${plant} credential'`,
		`git remote add origin-http http://127.0.0.1:${authPort}/repo.git`,
	]);
	await cell(rest, 'plain `git status` (control)', plainStatus, 'ran');
	await cell(rest, 'production probe', probe, 'blocked');
	await cell(rest, 'hardenedGit MUTATING: checkout -f HEAD -- .', () => hardened(['checkout', '-f', 'HEAD', '--', '.'], false), 'hook, smudge, clean run (by design)');
	await cell(rest, 'hardenedGit MUTATING: fetch origin-ssh', () => hardened(['fetch', 'origin-ssh'], false), 'sshcommand runs (by design)');
	await cell(rest, 'hardenedGit MUTATING: fetch origin-http (401)', () => hardened(['fetch', 'origin-http'], false), 'credential helper (inconclusive if nothing runs)');
	await inVm(
		[
			'mkdir -p .git/evil-hooks',
			`printf '#!/bin/sh\\nsh ${plant} hookspath\\n' > .git/evil-hooks/post-checkout && chmod +x .git/evil-hooks/post-checkout`,
			`git config core.hooksPath '${slot.replaceAll('\\', '/')}/.git/evil-hooks'`,
		],
		false
	);
	await cell('core.hooksPath planted', 'hardenedGit READING: checkout -f HEAD -- .', () => hardened(['checkout', '-f', 'HEAD', '--', '.'], true), 'blocked (NUL hooksPath)');
	await cell('core.hooksPath planted', 'hardenedGit MUTATING: checkout -f HEAD -- .', () => hardened(['checkout', '-f', 'HEAD', '--', '.'], false), 'runs (by design)');

	// ================= 6. the host user's home directory: what is visible and writable from the VM
	const home = posix(os.homedir());
	const homeLook = await runtime.exec({
		sandbox,
		command: ['bash', '-s'],
		stdin: [
			'set +e',
			'echo "--- as agent: git variables, VM-own home"',
			'env | grep -i "^GIT_" || echo "(no GIT_* variable)"',
			'echo "HOME=$HOME XDG_CONFIG_HOME=${XDG_CONFIG_HOME-unset}"',
			'echo "--- as root: the host paths mounted at all"',
			`sudo -n sh -c "grep ' virtiofs ' /proc/self/mountinfo | awk '{print \\$5}'"`,
			'echo "--- as root: a second mount of the whole share"',
			'sudo -n mkdir -p /mnt/second && sudo -n mount -t virtiofs -o rw host /mnt/second',
			`echo "names directly in the host user directory:"; sudo -n ls -a '/mnt/second${home}' 2>&1 | head -12`,
			`echo "root creates a decoy there:"; sudo -n sh -c "echo decoy > '/mnt/second${home}/flow-decoy.txt'" 2>&1; echo "exit $?"`,
			`echo "agent creates a decoy there:"; sh -c "echo decoy > '/mnt/second${home}/flow-decoy.txt'" 2>&1; echo "exit $?"`,
			`echo "root creates a directory there:"; sudo -n mkdir '/mnt/second${home}/flow-decoy-dir' 2>&1; echo "exit $?"`,
		].join('\n'),
	});
	report.homeReach = {
		output: homeLook.stdout + homeLook.stderr,
		hostDecoyFileExists: fs.existsSync(path.join(os.homedir(), 'flow-decoy.txt')),
		hostDecoyDirExists: fs.existsSync(path.join(os.homedir(), 'flow-decoy-dir')),
	};
	console.log(`\n${report.homeReach.output}`);
	console.log(`host after the attempts: decoy file exists=${report.homeReach.hostDecoyFileExists}, decoy dir exists=${report.homeReach.hostDecoyDirExists}`);
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
	try {
		fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
	} catch (error) {
		console.error(`The temporary tree ${root} could not be removed (${error.code}): remove it by hand.`);
	}
}
