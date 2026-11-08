/**
 * GATED live EXPERIMENT (not a pass/fail check): is a read-only (`:ro`) mount of sbx enforced by the HOST side or only by the options of
 * the mount inside the VM? Never part of `npm test`, `npm run check` or CI. Creates ONE sandbox `flow-sbx-live-ro-<random>` (image from
 * RO_IMAGE, default flow-sandbox:m6) with a read/write primary workspace and a SECOND mount flagged read-only, tries to defeat the
 * read-only from inside as the agent user and as root (`sudo -n`), and looks at the HOST file afterwards. Nothing is installed (no
 * network rule is opened, nothing is downloaded): only tools already in the image are used. Everything is removed in a `finally`.
 * Changes no setting and no policy.
 *
 * The attempts, in order (each is reported with its exit code and output): the baseline write; what the VM says about the mount
 * (/proc/self/mountinfo); a remount as root; a new mount namespace (`unshare -m`) with a bind and remount; mounting the SAME
 * virtiofs/9p share again without `ro` (the decisive one: it asks the host side whether the share is writable); a write through
 * /proc/<pid>/root and an open file descriptor; interpreters (perl/python) calling mount(2) directly when they exist.
 * The verdict is taken on the HOST: did the file in the read-only directory change.
 *
 * Usage: SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/ReadOnlyLiveCheck.mjs
 * Output: JSON on stdout and in .claude/temp/sbx-0-51/readonly-results.json.
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PathTranslator } from '../../src/PathTranslator.ts';
import { SbxCliRuntime } from '../../src/SbxCliRuntime.ts';

if (process.env.SBX_LIVE !== '1') {
	console.error('ReadOnlyLiveCheck refused to run: set SBX_LIVE=1 to confirm that you want to create and remove a real sandbox.');
	process.exit(2);
}
if (process.env.SBX_MOCK_PATH) {
	console.error('ReadOnlyLiveCheck refused to run: SBX_MOCK_PATH is set, the result would not be live.');
	process.exit(2);
}

const suffix = randomBytes(3).toString('hex');
const sandbox = `flow-sbx-live-ro-${suffix}`;
const image = process.env.RO_IMAGE ?? 'flow-sandbox:m6';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `flow-sbx-ro-${suffix}-`)));
const workspace = path.join(root, 'ws');
const readOnlyDirectory = path.join(root, 'ro');
fs.mkdirSync(workspace);
fs.mkdirSync(readOnlyDirectory);
const protectedFile = path.join(readOnlyDirectory, 'protected.txt');
fs.writeFileSync(protectedFile, 'ORIGINAL\n');

const runtime = new SbxCliRuntime();
const wsTranslator = new PathTranslator({ workspaceDir: workspace, workspaceMetaDir: readOnlyDirectory, platform: process.platform });
const report = { sandbox, image, platform: `${process.platform} ${os.release()}`, attempts: {} };

try {
	console.log(`sandbox ${sandbox}, image ${image}, root ${root}`);
	await runtime.create({
		name: sandbox,
		agent: 'shell',
		image,
		pull: 'never',
		// The primary mount must be read/write; the second one is the read-only one under test.
		mounts: [{ hostPath: workspace }, { hostPath: readOnlyDirectory, readOnly: true }],
		cpus: 2,
		memory: '2g',
	});
	const ro = wsTranslator.toSandbox(readOnlyDirectory, 'ro');
	const ws = wsTranslator.toSandbox(workspace, 'ws');

	const script = `
set +e
RO='${ro}'
section() { echo; echo "##### $1"; }
run() { echo "\$ $*"; "$@" 2>&1; echo "[exit $?]"; }
section 'who and what is available (nothing is installed)'
id
for tool in sudo mount umount unshare nsenter python3 python perl busybox gcc cc strace losetup findmnt; do
  printf '%s: ' "$tool"; command -v "$tool" || sudo -n sh -c "command -v $tool" 2>/dev/null || echo 'absent'
done
section 'mountinfo of the read-only mount, and of the workspace mount'
grep -F " $RO " /proc/self/mountinfo
grep -F "/ws " /proc/self/mountinfo
grep -E ' (virtiofs|9p|fuse[^ ]*) ' /proc/self/mountinfo
section 'baseline: write as agent'
run sh -c "echo AGENT >> '$RO/protected.txt'"
run sh -c "echo new > '$RO/new-file.txt'"
section 'root: plain write'
run sudo -n sh -c "echo ROOT >> '$RO/protected.txt'"
section 'root: remount rw'
run sudo -n mount -o remount,rw "$RO"
run sudo -n sh -c "echo REMOUNT >> '$RO/protected.txt'"
section 'root: clear the per-mount ro flag in place (remount,bind,rw) and look at the result'
run sudo -n mount -o remount,bind,rw "$RO"
grep -F " $RO " /proc/self/mountinfo | head -1
run sudo -n sh -c "echo BINDREMOUNT >> '$RO/protected.txt'"
section 'root: new mount namespace, bind the directory and remount the bind rw'
run sudo -n unshare -m sh -c "mkdir -p /tmp/rwbind && mount --bind '$RO' /tmp/rwbind && mount -o remount,bind,rw /tmp/rwbind && echo BIND >> /tmp/rwbind/protected.txt"
section 'root: mount the SAME share again without ro (asks the host side)'
SRC=$(awk -v mp="$RO" '$5==mp {print $NF}' /proc/self/mountinfo | head -1)
FST=$(awk -v mp="$RO" '$5==mp {for(i=6;i<=NF;i++) if($i=="-") {print $(i+1); exit}}' /proc/self/mountinfo)
SOURCE=$(awk -v mp="$RO" '$5==mp {for(i=6;i<=NF;i++) if($i=="-") {print $(i+2); exit}}' /proc/self/mountinfo)
echo "fstype=$FST source=$SOURCE"
run sudo -n mkdir -p /mnt/second
run sudo -n mount -t "$FST" -o rw "$SOURCE" /mnt/second
run sudo -n ls /mnt/second
run sudo -n sh -c "echo SECONDMOUNT >> '/mnt/second$RO/protected.txt'"
run sudo -n sh -c "echo SECONDNEW > '/mnt/second$RO/second-new.txt'"
section 'control and reach: the second mount of the share is writable where the host allows it, and what it exposes'
WS='${ws}'
run sudo -n sh -c "echo CONTROL > '/mnt/second$WS/control.txt'"
run sudo -n ls -a "/mnt/second$(dirname "$RO")"
run sudo -n ls /mnt/second/c
run sudo -n ls -la /mnt/second/e
run sudo -n ls /mnt/second/c/Users
run sudo -n sh -c "echo OUTSIDE > '/mnt/second$(dirname "$RO")/outside-the-mounts.txt'"
section 'root: the same share, a bind of its sub directory, rw, then write'
run sudo -n mkdir -p /mnt/third
run sudo -n mount --bind "/mnt/second$RO" /mnt/third
run sudo -n sh -c "echo THIRD >> /mnt/third/protected.txt"
section 'root: write through /proc/<pid>/root and through a descriptor opened before'
run sudo -n sh -c "exec 3< '$RO/protected.txt'; echo FD >> /proc/self/fd/3"
run sudo -n sh -c "echo PROCROOT >> /proc/1/root$RO/protected.txt"
section 'interpreters calling mount(2) directly (only if present)'
if command -v perl >/dev/null; then
  run sudo -n perl -e 'require "syscall.ph"; print "perl: ok\\n"'
fi
if command -v python3 >/dev/null; then
  run sudo -n python3 -c "import ctypes,os; libc=ctypes.CDLL(None,use_errno=True); r=libc.mount(None, b'$RO', None, 32, None); print('python mount(MS_REMOUNT) ->', r, os.strerror(ctypes.get_errno()))"
fi
section 'final state seen from the VM'
cat "$RO/protected.txt"
ls -la "$RO"
`;
	const result = await runtime.exec({ sandbox, command: ['bash', '-s'], stdin: script });
	report.vmExitCode = result.exitCode;
	report.vmOutput = result.stdout;
	report.vmStderr = result.stderr;
} catch (error) {
	report.error = error instanceof Error ? error.stack : String(error);
	process.exitCode = 1;
} finally {
	// The verdict is taken on the HOST.
	report.hostAfter = {
		workspaceFiles: fs.readdirSync(workspace),
		rootFiles: fs.readdirSync(root),
		protectedFile: fs.existsSync(protectedFile) ? fs.readFileSync(protectedFile, 'utf8') : '(missing)',
		directory: fs.readdirSync(readOnlyDirectory),
	};
	report.verdict =
		report.hostAfter.protectedFile === 'ORIGINAL\n' && report.hostAfter.directory.join(',') === 'protected.txt'
			? 'HOST FILE UNCHANGED: the read-only mount held against every attempt that ran'
			: 'HOST FILE CHANGED: the read-only mount was DEFEATED, see vmOutput';
	try {
		await runtime.remove(sandbox);
		console.log(`cleanup: sandbox ${sandbox} removed`);
	} catch (error) {
		console.error(`CLEANUP FAILED: run "sbx rm --force ${sandbox}" by hand: ${error.message}`);
		process.exitCode = 1;
	}
	const output = path.resolve(import.meta.dirname, '..', '..', '..', '..', '.claude', 'temp', 'sbx-0-51');
	fs.mkdirSync(output, { recursive: true });
	fs.writeFileSync(path.join(output, 'readonly-results.json'), JSON.stringify(report, null, 2));
	console.log(report.vmOutput ?? '');
	console.log(JSON.stringify({ ...report, vmOutput: undefined }, null, 2));
	fs.rmSync(root, { recursive: true, force: true });
}
