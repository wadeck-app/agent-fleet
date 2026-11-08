/**
 * GATED live EXPERIMENT (not a pass/fail check): what happens to symbolic links across the sbx mount, in both directions.
 * Never part of `npm test`, `npm run check` or CI. Creates ONE sandbox `flow-sbx-live-sym-<random>` (image from SYM_IMAGE, default
 * flow-sandbox:m6; two mounts like a run: a workspace and a `.meta`), removes it and its temporary tree in a `finally`. Changes no
 * setting and no policy, opens no network rule.
 *
 * Part 1, VM -> host: from inside the VM, as the agent user, link names are created in the workspace and in `<meta>/outputs`
 * (file link to /etc/hostname, directory link to /etc, relative links that climb out, link texts that are valid WINDOWS paths of a
 * canary file outside both mounts). On the HOST each result is looked at with lstat/readlink and followed with a read; the run's own
 * guard (RunMounts) is asked about each too.
 * Part 2, host -> VM: a junction and (if the account may) a file symlink are created on the host inside the workspace, pointing
 * outside the mounts, and the VM reads through them.
 *
 * Usage: SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/SymlinkLiveCheck.mjs
 * Output: a JSON report on stdout (last block) and in .claude/temp/sbx-0-51/symlink-results.json.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PathTranslator } from '../../src/PathTranslator.ts';
import { RunMounts } from '../../src/RunMounts.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';

if (process.env.SBX_LIVE !== '1') {
	console.error('SymlinkLiveCheck refused to run: set SBX_LIVE=1 to confirm that you want to create and remove a real sandbox.');
	process.exit(2);
}
if (process.env.SBX_MOCK_PATH) {
	console.error('SymlinkLiveCheck refused to run: SBX_MOCK_PATH is set, the result would not be live.');
	process.exit(2);
}

const suffix = randomBytes(3).toString('hex');
const sandbox = `flow-sbx-live-sym-${suffix}`;
const image = process.env.SYM_IMAGE ?? 'flow-sandbox:m6';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-sym-${suffix}-`)));
const workspace = path.join(root, 'ws');
const meta = path.join(root, 'ws.meta');
const outsideDirectory = path.join(root, 'outside-dir');
const canary = path.join(root, 'canary-outside.txt');
fs.mkdirSync(workspace);
fs.mkdirSync(path.join(meta, 'outputs'), { recursive: true });
fs.mkdirSync(outsideDirectory);
fs.writeFileSync(canary, 'CANARY-OUTSIDE-THE-MOUNTS\n');
fs.writeFileSync(path.join(outsideDirectory, 'secret.txt'), 'SECRET-IN-OUTSIDE-DIR\n');

const runtime = new SbxCliRuntime();
const translator = new PathTranslator({ workspaceDir: workspace, workspaceMetaDir: meta, platform: process.platform });
const mounts = new RunMounts({
	workspaceDir: workspace,
	workspaceMetaDir: meta,
	platform: process.platform,
	log: { info: () => undefined, warn: () => undefined },
});
const report = { sandbox, image, platform: `${process.platform} ${os.release()}`, vmToHost: [], hostToVm: [], notes: [] };

async function inVm(script) {
	return runtime.exec({ sandbox, command: ['bash', '-s'], stdin: script, cwd: translator.toSandbox(workspace, 'cwd') });
}

/** What the host sees of one entry: type, link text, whether a read follows it and what it yields. */
function look(hostPath) {
	const entry = { path: hostPath };
	try {
		const stats = fs.lstatSync(hostPath);
		Object.assign(entry, {
			isSymbolicLink: stats.isSymbolicLink(),
			isFile: stats.isFile(),
			isDirectory: stats.isDirectory(),
			size: stats.size,
		});
	} catch (error) {
		entry.lstatError = `${error.code ?? ''} ${error.message}`;
		return entry;
	}
	try {
		entry.readlink = fs.readlinkSync(hostPath);
	} catch (error) {
		entry.readlinkError = error.code ?? error.message;
	}
	try {
		entry.followedRead = fs.statSync(hostPath).isDirectory()
			? `directory: ${fs.readdirSync(hostPath).join(',')}`
			: fs.readFileSync(hostPath, 'utf8').slice(0, 80);
	} catch (error) {
		entry.followedReadError = error.code ?? error.message;
	}
	try {
		mounts.toHostPath(translator.toSandbox(hostPath, 'probe'), 'probe');
		entry.runMountsGuard = 'accepted';
	} catch (error) {
		entry.runMountsGuard = `refused: ${error.message.slice(0, 140)}`;
	}
	return entry;
}

try {
	console.log(`sandbox ${sandbox}, image ${image}, root ${root}`);
	await runtime.create({
		name: sandbox,
		agent: 'shell',
		image,
		pull: 'never',
		mounts: [{ hostPath: workspace }, { hostPath: meta }],
		cpus: 2,
		memory: '2g',
	});
	const wsVm = translator.toSandbox(workspace, 'ws');
	const metaVm = translator.toSandbox(meta, 'meta');
	const windowsCanary = canary;
	const forwardCanary = canary.replaceAll('\\', '/');

	// ---- Part 1: VM -> host
	const script = [
		'set -u',
		`cd '${wsVm}'`,
		'echo "uid=$(id -u) user=$(id -un)"',
		'try() { label="$1"; shift; if "$@" 2>/tmp/err.txt; then echo "OK   $label"; else echo "FAIL $label: $(cat /tmp/err.txt)"; fi; }',
		'try file-link-etc-hostname ln -s /etc/hostname evil-link',
		'try dir-link-etc ln -s /etc evil-dir',
		'try relative-link-up ln -s ../canary-outside.txt rel-up',
		'try relative-link-up-up ln -s ../../x rel-up-up',
		`try link-text-windows-path ln -s '${windowsCanary.replaceAll("'", "'\\''")}' win-canary`,
		`try link-text-forward-path ln -s '${forwardCanary}' fwd-canary`,
		`try link-text-vm-mount-path ln -s '${wsVm}' self-dir`,
		'try meta-output-link ln -s ../../x ' + `'${metaVm}/outputs/y'`,
		'try hard-link-etc-hostname ln /etc/hostname hard-evil',
		'try regular-file sh -c "echo plain > plain.txt"',
		// The agent user has passwordless sudo in these images: the same links as root.
		'sudo -n true 2>/dev/null && echo "sudo: available" || echo "sudo: NOT available"',
		'try root-file-link sudo -n ln -s /etc/hostname root-evil-link',
		'try root-dir-link sudo -n ln -s /etc root-evil-dir',
		`try root-link-text-windows-path sudo -n ln -s '${windowsCanary.replaceAll("'", "'\\''")}' root-win-canary`,
		'try root-relative-link sudo -n ln -s ../canary-outside.txt root-rel-up',
		`try root-meta-output-link sudo -n ln -s ../../x '${metaVm}/outputs/root-y'`,
		'sudo -n sh -c "id -u; mount 2>&1 | head -3; command -v mount; grep -E \'virtiofs|9p|fuse\' /proc/mounts | head -5"',
		'ls -la',
		`ls -la '${metaVm}/outputs'`,
	].join('\n');
	const vm = await inVm(script);
	report.vmScript = { exitCode: vm.exitCode, stdout: vm.stdout, stderr: vm.stderr };
	const names = ['root-evil-link', 'root-evil-dir', 'root-win-canary', 'root-rel-up', 'evil-link', 'evil-dir', 'rel-up', 'rel-up-up', 'win-canary', 'fwd-canary', 'self-dir', 'hard-evil', 'plain.txt'];
	for (const name of names) report.vmToHost.push({ name, ...look(path.join(workspace, name)) });
	report.vmToHost.push({ name: 'meta/outputs/y', ...look(path.join(meta, 'outputs', 'y')) });
	report.vmToHost.push({ name: 'meta/outputs/root-y', ...look(path.join(meta, 'outputs', 'root-y')) });

	// ---- Part 2: host -> VM
	const hostLinks = [];
	const tryHost = (name, kind, target) => {
		const where = path.join(workspace, name);
		try {
			fs.symlinkSync(target, where, kind);
			hostLinks.push(name);
			return 'created';
		} catch (error) {
			return `not created: ${error.code ?? ''} ${error.message}`;
		}
	};
	report.hostToVm.push({ name: 'host-junction', created: tryHost('host-junction', 'junction', outsideDirectory) });
	report.hostToVm.push({ name: 'host-file-symlink', created: tryHost('host-file-symlink', 'file', canary) });
	report.hostToVm.push({ name: 'host-dir-symlink', created: tryHost('host-dir-symlink', 'dir', outsideDirectory) });
	const seen = await inVm(
		[
			'set -u',
			`cd '${wsVm}'`,
			'for n in host-junction host-file-symlink host-dir-symlink; do',
			'  echo "== $n"; ls -ld "$n" 2>&1; stat -c "%F" "$n" 2>&1; readlink "$n" 2>&1;',
			'  if [ -d "$n" ]; then ls -la "$n" 2>&1 | head -5; cat "$n/secret.txt" 2>&1; else cat "$n" 2>&1 | head -2; fi;',
			'done',
		].join('\n')
	);
	report.hostToVmSeenFromVm = { exitCode: seen.exitCode, stdout: seen.stdout, stderr: seen.stderr };
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
	// Links are removed without following them; fs.rmSync does not follow a link either.
	for (const entry of fs.existsSync(workspace) ? fs.readdirSync(workspace) : []) {
		const full = path.join(workspace, entry);
		try {
			if (fs.lstatSync(full).isSymbolicLink()) fs.unlinkSync(full);
		} catch {
			// removal of the tree below reports what remains
		}
	}
	const output = path.resolve(import.meta.dirname, '..', '..', '..', '..', '.claude', 'temp', 'sbx-0-51');
	fs.mkdirSync(output, { recursive: true });
	fs.writeFileSync(path.join(output, 'symlink-results.json'), JSON.stringify(report, null, 2));
	console.log(JSON.stringify(report, null, 2));
	fs.rmSync(root, { recursive: true, force: true });
	console.log(`canary file intact before removal of the tree: ${fs.existsSync(root) ? 'tree still there' : 'tree removed'}`);
}
