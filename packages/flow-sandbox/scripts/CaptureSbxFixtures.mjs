#!/usr/bin/env node

/**
 * Captures REAL sbx outputs into fixtures/sbx-<version>/ for the sbx mock (src/testing/sbx-mock.mjs).
 *
 * Read-only commands and "not found" probes touch nothing. The populated `ls --json` and `policy ls --json` need
 * something to list, so the script creates ONE throw-away sandbox (flow-sbx-capture-<random>, agent shell,
 * --cpus 2 -m 2g) with ONE sandbox-scoped allow rule, and removes both in a finally block. It never changes a
 * global policy or a setting. It refuses to write an `ls-json` without that sandbox or a `policy-ls-json` without a
 * sandbox-scoped rule, so a populated fixture can never silently become an empty one.
 *
 * Usage: node scripts/CaptureSbxFixtures.mjs [--sbx <path to sbx>] [--only <id>[,<id>...]]
 *   --sbx   default: SBX_PATH, then the Windows install dir
 *   --only  capture just these command ids and merge them into the existing manifest (the other fixtures stay as they are)
 *
 * The user name is replaced by <user> in every captured text. Review `git diff` before committing.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const sbxFlag = argv.indexOf('--sbx');
const sbx =
	(sbxFlag >= 0 ? argv[sbxFlag + 1] : undefined) ??
	process.env.SBX_PATH ??
	path.join(process.env.LOCALAPPDATA ?? '', 'DockerSandboxes', 'bin', 'sbx.exe');

// A name that cannot exist: the probes below must fail with "not found" and touch nothing.
const MISSING = 'fs-capture-missing';

// `<sandbox>` stands for the throw-away capture sandbox. `before` runs (unrecorded) just before the capture.
const COMMANDS = [
	{ id: 'version', args: ['version'] },
	// The FIRST bash after create: the default templates print a banner on stdout (/etc/bash.bashrc sources /etc/profile.d/01-dhi.sh once per sandbox); the flow-sandbox images do not.
	{ id: 'exec-first-after-create', args: ['exec', '<sandbox>', '--', 'bash', '-c', 'true'] },
	{ id: 'ls-json', args: ['ls', '--json'] },
	{ id: 'ls-table', args: ['ls'] },
	{ id: 'diagnose-json', args: ['diagnose', '--json'] },
	{ id: 'policy-ls-json', args: ['policy', 'ls', '--json'] },
	{ id: 'policy-ls-table', args: ['policy', 'ls'] },
	{ id: 'settings-ls-json', args: ['settings', 'ls', '--json'] },
	{ id: 'help-root', args: ['--help'] },
	{ id: 'help-create', args: ['create', '--help'] },
	{ id: 'help-exec', args: ['exec', '--help'] },
	{ id: 'help-stop', args: ['stop', '--help'] },
	{ id: 'help-rm', args: ['rm', '--help'] },
	{ id: 'help-cp', args: ['cp', '--help'] },
	{ id: 'help-ls', args: ['ls', '--help'] },
	{ id: 'help-policy-allow-network', args: ['policy', 'allow', 'network', '--help'] },
	{ id: 'help-policy-rm-network', args: ['policy', 'rm', 'network', '--help'] },
	{ id: 'help-policy-ls', args: ['policy', 'ls', '--help'] },
	{ id: 'help-secret-set-custom', args: ['secret', 'set-custom', '--help'] },
	{ id: 'help-secret-rm', args: ['secret', 'rm', '--help'] },
	{ id: 'help-secret-set', args: ['secret', 'set', '--help'] },
	{ id: 'help-diagnose', args: ['diagnose', '--help'] },
	{ id: 'help-settings-set', args: ['settings', 'set', '--help'] },
	{ id: 'help-login', args: ['login', '--help'] },
	{ id: 'help-policy-init', args: ['policy', 'init', '--help'] },
	{ id: 'err-exec-missing', args: ['exec', MISSING, 'true'] },
	{ id: 'err-stop-missing', args: ['stop', MISSING] },
	{ id: 'err-rm-missing', args: ['rm', '--force', MISSING] },
	{ id: 'err-cp-missing', args: ['cp', `${MISSING}:/x`, os.tmpdir()] },
	{ id: 'err-unknown-verb', args: ['nosuchverb'] },
	// An exec on a STOPPED sandbox starts it and prints a notice on stderr. Last, so the listings above stay `running`.
	{ id: 'exec-after-stop', args: ['exec', '<sandbox>', 'true'], before: ['stop', '<sandbox>'] },
];

function run(args) {
	const result = spawnSync(sbx, args, {
		encoding: 'utf8',
		windowsHide: true,
		shell: false,
		env: { ...process.env, MSYS_NO_PATHCONV: '1' },
	});
	if (result.error) {
		throw new Error(
			`Cannot run sbx at "${sbx}": ${result.error.message}. Pass --sbx <path> or set SBX_PATH to the sbx binary.`
		);
	}
	return result;
}

// The command ids whose output lists the throw-away sandbox or its scoped rule.
const NEEDS_CAPTURE_SANDBOX = [
	'ls-json',
	'ls-table',
	'policy-ls-json',
	'policy-ls-table',
	'exec-first-after-create',
	'exec-after-stop',
];
const CAPTURE_RULE_RESOURCE = 'example.com:443';

function runChecked(args) {
	const result = run(args);
	if (result.status !== 0) {
		throw new Error(
			`\`sbx ${args.join(' ')}\` failed (exit ${result.status}): ${(result.stderr || result.stdout).trim()}`
		);
	}
	return result;
}

// Refuses a capture that would turn a "populated" fixture into an empty one.
function assertPopulated(id, stdout, sandboxName) {
	if (id === 'ls-json') {
		const listed = JSON.parse(stdout);
		if (!Array.isArray(listed) || !listed.some(entry => entry.name === sandboxName)) {
			throw new Error(
				`Refusing to write ls-json: it does not list the capture sandbox ${sandboxName}: ${stdout.trim()}`
			);
		}
	}
	if (id === 'policy-ls-json') {
		const policy = JSON.parse(stdout);
		if (!policy.rules?.some(rule => rule.scope !== 'global')) {
			throw new Error(
				'Refusing to write policy-ls-json: it has no sandbox-scoped rule (the populated variant would be empty).'
			);
		}
	}
}

function sanitize(text) {
	const user = os.userInfo().username;
	return text.split(user).join('<user>');
}

const versionResult = run(['version']);
const versionMatch = /v(\d+\.\d+\.\d+)/.exec(versionResult.stdout);
if (!versionMatch) {
	throw new Error(`Cannot read the sbx version from: ${JSON.stringify(versionResult.stdout)}`);
}
const version = versionMatch[1];

// Guard the "not found" probes: refuse to run when that name exists.
const existing = run(['ls', '--json']).stdout;
if (existing.includes(MISSING)) {
	throw new Error(`A sandbox named "${MISSING}" exists; remove it before capturing.`);
}

const outDir = path.join(packageDir, 'fixtures', `sbx-${version}`);
mkdirSync(outDir, { recursive: true });

const onlyFlag = argv.indexOf('--only');
const only = onlyFlag >= 0 ? (argv[onlyFlag + 1] ?? '').split(',').filter(Boolean) : undefined;
if (only !== undefined) {
	const unknown = only.filter(id => !COMMANDS.some(command => command.id === id));
	if (only.length === 0 || unknown.length > 0) {
		throw new Error(
			`--only needs known command ids (${COMMANDS.map(c => c.id).join(', ')}); got: ${unknown.join(', ') || '(nothing)'}`
		);
	}
}
const manifestPath = path.join(outDir, 'manifest.json');
const entries = [];
const selected = COMMANDS.filter(candidate => only === undefined || only.includes(candidate.id));
const captureSandbox = selected.some(command => NEEDS_CAPTURE_SANDBOX.includes(command.id))
	? `flow-sbx-capture-${crypto.randomBytes(4).toString('hex')}`
	: undefined;
const captureWorkspace =
	captureSandbox === undefined ? undefined : mkdtempSync(path.join(os.tmpdir(), 'flow-sbx-capture-'));
let ruleAdded = false;
let sandboxMayExist = false;
try {
	if (captureSandbox !== undefined) {
		sandboxMayExist = true;
		runChecked(['create', '--name', captureSandbox, '--cpus', '2', '-m', '2g', 'shell', captureWorkspace]);
		runChecked(['policy', 'allow', 'network', '--sandbox', captureSandbox, CAPTURE_RULE_RESOURCE]);
		ruleAdded = true;
		console.log(`created throw-away sandbox ${captureSandbox} with one scoped rule`);
	}
	for (const command of selected) {
		const withSandbox = args => args.map(arg => (arg === '<sandbox>' ? captureSandbox : arg));
		if (command.before !== undefined) runChecked(withSandbox(command.before));
		const result = run(withSandbox(command.args));
		assertPopulated(command.id, result.stdout, captureSandbox);
		const stdoutFile = `${command.id}.stdout.txt`;
		const stderrFile = `${command.id}.stderr.txt`;
		// The sandbox name and the workspace folder are random per capture (the mock puts the real ones back).
		const anonymize = text =>
			sanitize(text)
				.replaceAll(captureSandbox ?? '\0', '<sandbox>')
				// The banner prints the workspace path cut from the left ("...ox-capture-AbC"): only its row is replaced.
				.replace(/(workspace {2})\S+$/m, '$1<workspace>');
		writeFileSync(path.join(outDir, stdoutFile), anonymize(result.stdout));
		writeFileSync(path.join(outDir, stderrFile), anonymize(result.stderr));
		entries.push({ id: command.id, args: command.args, exitCode: result.status, stdoutFile, stderrFile });
		console.log(`captured ${command.id} (exit ${result.status})`);
	}
} finally {
	// A cleanup failure is reported loudly but never hides the capture error.
	if (captureSandbox !== undefined) {
		if (ruleAdded) {
			const removedRule = run([
				'policy',
				'rm',
				'network',
				'--force',
				'--sandbox',
				captureSandbox,
				'--resource',
				CAPTURE_RULE_RESOURCE,
			]);
			if (removedRule.status !== 0) {
				console.error(
					`CLEANUP FAILED: remove the rule ${CAPTURE_RULE_RESOURCE} of ${captureSandbox} by hand: ${removedRule.stderr.trim()}`
				);
			}
		}
		if (sandboxMayExist) {
			const removed = run(['rm', '--force', captureSandbox]);
			if (removed.status !== 0 && !/not found/i.test(removed.stderr + removed.stdout)) {
				console.error(
					`CLEANUP FAILED: run \`sbx rm --force ${captureSandbox}\` by hand: ${removed.stderr.trim()}`
				);
			}
		}
		rmSync(captureWorkspace, { recursive: true, force: true });
	}
}

if (only !== undefined) {
	if (!existsSync(manifestPath))
		throw new Error(`--only merges into ${manifestPath}, which does not exist: run the full capture first.`);
	const previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const merged = COMMANDS.map(
		command => entries.find(e => e.id === command.id) ?? previous.commands.find(e => e.id === command.id)
	).filter(Boolean);
	writeFileSync(manifestPath, JSON.stringify({ ...previous, commands: merged }, null, '\t') + '\n');
	console.log(`Merged ${entries.length} commands into ${manifestPath}`);
	process.exit(0);
}

const manifest = {
	sbxVersion: version,
	capturedAt: new Date().toISOString(),
	platform: `${process.platform} ${os.release()}`,
	note: 'REAL outputs of read-only sbx commands. Anything the mock emits that is not in this list is SYNTHETIC (see README).',
	commands: entries,
};
writeFileSync(path.join(outDir, 'manifest.json'), sanitize(JSON.stringify(manifest, null, '\t')) + '\n');
console.log(`Wrote ${entries.length} commands to ${outDir}`);
