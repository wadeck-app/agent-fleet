#!/usr/bin/env node

/**
 * Mock `sbx` CLI for deterministic tests (selected through SBX_MOCK_PATH, see SbxBinaryLocator).
 *
 * Fidelity rules (.claude/docs/mock-fidelity.md):
 * - Outputs of read-only commands (version, ls, diagnose, policy ls, settings ls, --help, "not found"
 *   errors) are the REAL captures under fixtures/sbx-<version>/ (see its manifest.json).
 * - Flags are validated against the Flags section of the captured `--help`, so an invented flag fails here
 *   like it fails on the real sbx.
 * - Everything else is SYNTHETIC: the success text of create/stop/rm/cp, the duplicate-name error, the
 *   failure outputs of the SBX_MOCK_SCENARIO values, policy allow/rm and secret commands. They are marked
 *   `synthetic` below and listed in the package README. The live check (scripts/live) is what verifies them.
 * - `exec` does not run a VM: the command is one of a few pseudo commands (see runPseudoCommand).
 *
 * Environment:
 *   SBX_MOCK_STATE_DIR   REQUIRED. Directory holding state.json (sandboxes) and calls.jsonl (one line per invocation).
 *   SBX_MOCK_SCENARIO    Comma separated: not-signed-in, policy-uninitialized, daemon-down, ssh-off,
 *                        network-deny-all, network-allow-all, version:<x.y.z>, diagnose-garbage, diagnose-without-auth,
 *                        daemon-unhealthy, policy-garbage, settings-garbage, ssh-setting-missing, ssh-setting-string.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_VERSION = '0.49.2';
const fixtureDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'fixtures',
	`sbx-${FIXTURE_VERSION}`
);

function fail(message, code = 1) {
	process.stderr.write(`${message}\n`);
	process.exit(code);
}

const stateDir = process.env.SBX_MOCK_STATE_DIR;
if (!stateDir) {
	fail('sbx-mock: SBX_MOCK_STATE_DIR is not set. Tests must give every mock run its own state directory.', 2);
}
fs.mkdirSync(stateDir, { recursive: true });
const statePath = path.join(stateDir, 'state.json');
const callsPath = path.join(stateDir, 'calls.jsonl');
const scenarios = (process.env.SBX_MOCK_SCENARIO ?? '').split(',').filter(Boolean);
const hasScenario = name => scenarios.includes(name);

function fixture(file) {
	const full = path.join(fixtureDir, file);
	if (!fs.existsSync(full)) {
		fail(`sbx-mock: fixture ${full} is missing. Run scripts/CaptureSbxFixtures.mjs.`, 2);
	}
	return fs.readFileSync(full, 'utf8');
}

function loadState() {
	if (!fs.existsSync(statePath)) return { sandboxes: {}, rules: [], secrets: [] };
	return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function saveState(state) {
	const temp = `${statePath}.tmp`;
	fs.writeFileSync(temp, JSON.stringify(state, null, 2));
	fs.renameSync(temp, statePath);
}

function readStdin() {
	try {
		return fs.readFileSync(0, 'utf8');
	} catch {
		return '';
	}
}

// ---- flag parsing driven by the captured help ----

const HELP_FIXTURES = {
	create: 'help-create',
	exec: 'help-exec',
	stop: 'help-stop',
	rm: 'help-rm',
	cp: 'help-cp',
	ls: 'help-ls',
	'policy allow network': 'help-policy-allow-network',
	'policy rm network': 'help-policy-rm-network',
	'policy ls': 'help-policy-ls',
	'secret set-custom': 'help-secret-set-custom',
	'secret rm': 'help-secret-rm',
	'secret set': 'help-secret-set',
	diagnose: 'help-diagnose',
	'settings set': 'help-settings-set',
	login: 'help-login',
	'policy init': 'help-policy-init',
};
const GLOBAL_FLAGS = { '--cloud': false, '--debug': false, '-D': false, '--help': false, '-h': false };

/** Flags of a verb from the Flags section of its captured help: name -> takesValue. */
function flagsFromHelp(helpId) {
	const text = fixture(`${helpId}.stdout.txt`);
	const section = text.split(/^Flags:\n/m)[1]?.split(/^Global Flags:/m)[0] ?? '';
	const flags = { ...GLOBAL_FLAGS };
	for (const line of section.split('\n')) {
		const match =
			/^\s{2,}(?:(-\w), )?(--[\w-]+)(?: ([\w|]+))?\s{2,}/.exec(line) ??
			/^\s{2,}(?:(-\w), )?(--[\w-]+)(?: ([\w|]+))?$/.exec(line);
		if (!match) continue;
		const takesValue = match[3] !== undefined;
		flags[match[2]] = takesValue;
		if (match[1]) flags[match[1]] = takesValue;
	}
	return flags;
}

/** Splits argv into flag values and positionals. After `--` or, for exec, after the sandbox name, the rest is the command. */
function parseArgs(args, flags, { positionalLimit } = {}) {
	const values = {};
	const positionals = [];
	const rest = [];
	let index = 0;
	while (index < args.length) {
		const token = args[index];
		if (token === '--') {
			rest.push(...args.slice(index + 1));
			break;
		}
		if (positionalLimit !== undefined && positionals.length >= positionalLimit) {
			rest.push(...args.slice(index));
			break;
		}
		if (token.startsWith('-') && token !== '-') {
			const [name, inline] = token.startsWith('--') ? token.split(/=(.*)/s, 2) : [token, undefined];
			if (!(name in flags)) fail(`error: unknown flag: ${name}\n  try: sbx --help`);
			if (flags[name]) {
				const value = inline ?? args[++index];
				if (value === undefined) fail(`error: flag needs an argument: ${name}`);
				(values[name] ??= []).push(value);
			} else {
				values[name] = [true];
			}
		} else {
			positionals.push(token);
		}
		index += 1;
	}
	return { values, positionals, rest };
}

const first = (values, ...names) => names.map(n => values[n]?.[0]).find(v => v !== undefined);

// ---- main ----

const NL = String.fromCharCode(10);
const argv = process.argv.slice(2);
const verbMatch = Object.keys(HELP_FIXTURES)
	.sort((a, b) => b.length - a.length)
	.find(verb => argv.join(' ').startsWith(verb));
const separator = argv.indexOf('--');
const execFlags = separator === -1 ? argv : argv.slice(0, separator);
const readsStdin = (argv[0] === 'exec' && execFlags.includes('-i')) || (argv[0] === 'secret' && argv[1] === 'set');
const stdinText = readsStdin ? readStdin() : '';

const callRecord = { argv, msysNoPathconv: process.env.MSYS_NO_PATHCONV ?? null, stdin: stdinText };
function recordCall(extra = {}) {
	// workerEnv: names of FLOW_WORKER_* variables in the environment of THIS mock process (a test checks none leaked to an sbx child).
	const workerEnv = Object.keys(process.env).filter(name => /^FLOW_WORKER_/i.test(name));
	fs.appendFileSync(callsPath, `${JSON.stringify({ ...callRecord, workerEnv, ...extra })}\n`);
}

if (argv[0] === 'version') {
	recordCall();
	const version = scenarios.find(s => s.startsWith('version:'))?.slice('version:'.length);
	const out = fixture('version.stdout.txt');
	process.stdout.write(version ? out.replace(FIXTURE_VERSION, version) : out);
	process.exit(0);
}

if (verbMatch && (argv.includes('--help') || argv.includes('-h'))) {
	recordCall();
	process.stdout.write(fixture(`${HELP_FIXTURES[verbMatch]}.stdout.txt`));
	process.exit(0);
}
if (argv[0] === '--help') {
	recordCall();
	process.stdout.write(fixture('help-root.stdout.txt'));
	process.exit(0);
}

if (hasScenario('daemon-down')) {
	recordCall();
	// synthetic: the real "daemon down" output was not captured
	fail('error: cannot connect to the sandbox daemon (is sandboxd running?)\n  try: sbx daemon start');
}

const state = loadState();

function notFound(name) {
	// REAL text (err-*-missing fixtures)
	fail(`error: sandbox '${name}' not found\n  try: sbx ls`);
}

function requireSandbox(name) {
	if (!name) fail('error: sandbox name required');
	if (!state.sandboxes[name]) notFound(name);
	return state.sandboxes[name];
}

function checkWindowsPath(value, what) {
	// Mirrors the verified pitfall: sbx.exe cannot open a POSIX-form path.
	if (process.platform === 'win32' && !/^[A-Za-z]:\\/.test(value)) {
		fail(`error: ${what} "${value}": The system cannot find the path specified.`); // synthetic text
	}
}

function diagnoseOutput() {
	const report = JSON.parse(fixture('diagnose-json.stdout.txt'));
	const setCheck = (name, patch) => {
		const check = report.checks.find(c => c.name === name);
		if (!check) fail(`sbx-mock: diagnose fixture has no check "${name}"`, 2);
		Object.assign(check, patch);
	};
	// synthetic failure shapes: the real failure outputs were not captured
	if (hasScenario('not-signed-in')) {
		setCheck('Authentication', { status: 'fail', message: 'not authenticated', hint: 'Run: sbx login' });
	}
	if (hasScenario('diagnose-without-auth')) {
		report.checks = report.checks.filter(check => check.name !== 'Authentication');
	}
	if (hasScenario('daemon-unhealthy')) {
		// synthetic failure shape
		setCheck('Daemon', { status: 'fail', message: 'not responding', hint: 'Run: sbx daemon restart' });
	}
	if (hasScenario('policy-uninitialized')) {
		setCheck('Global network policy', {
			status: 'fail',
			message: 'not initialized',
			hint: 'Run: sbx policy init <allow-all|balanced|deny-all>',
		});
	}
	return JSON.stringify(report, null, 2);
}

function policyOutput() {
	if (hasScenario('policy-garbage')) return 'policy: this is not JSON';
	const policy = JSON.parse(fixture('policy-ls-json.stdout.txt'));
	// Drop the other agent's sandbox rules captured in the fixture: the baseline is the machine-wide policy.
	policy.rules = policy.rules.filter(rule => rule.scope === 'global');
	if (hasScenario('network-deny-all')) {
		policy.rules = policy.rules.filter(rule => !(rule.resource_type === 'network' && rule.decision === 'allow'));
	}
	if (hasScenario('network-allow-all')) {
		policy.rules.push({
			id: 'mock-allow-all',
			name: 'allow-all',
			scope: 'global',
			resource_type: 'network',
			decision: 'allow',
			resources: ['**'],
		});
	}
	for (const rule of state.rules) policy.rules.push(rule);
	return JSON.stringify(policy, null, 2);
}

function settingsOutput() {
	if (hasScenario('settings-garbage')) return 'settings: this is not JSON';
	const settings = JSON.parse(fixture('settings-ls-json.stdout.txt'));
	if (hasScenario('ssh-off')) {
		const entry = settings.find(s => s.key === 'ssh.agentForwardingEnabled');
		entry.value = false;
		entry.source = 'user';
		entry.default = false;
	}
	if (hasScenario('ssh-setting-missing')) {
		return JSON.stringify(
			settings.filter(s => s.key !== 'ssh.agentForwardingEnabled'),
			null,
			2
		);
	}
	if (hasScenario('ssh-setting-string')) {
		settings.find(s => s.key === 'ssh.agentForwardingEnabled').value = 'yes';
	}
	return JSON.stringify(settings, null, 2);
}

function runPseudoCommand(sandbox, command, cwd, env) {
	const [name, ...rest] = command;
	switch (name) {
		case 'true':
			return 0;
		case 'echo':
			process.stdout.write(`${rest.join(' ')}\n`);
			return 0;
		case 'cat':
			process.stdout.write(stdinText);
			return 0;
		case 'pwd':
			process.stdout.write(`${cwd ?? '/home/agent'}\n`);
			return 0;
		case 'whoami':
			process.stdout.write('agent\n');
			return 0;
		case 'printenv': {
			const value = env[rest[0]];
			if (value === undefined) return 1;
			process.stdout.write(`${value}\n`);
			return 0;
		}
		case 'exit':
			return Number(rest[0] ?? 0);
		case 'stderr':
			process.stderr.write(`${rest.join(' ')}\n`);
			return 0;
		case 'fail':
			// fail <code> <text...>: stderr text and a chosen exit code, like a failing program inside the VM.
			process.stderr.write(`${rest.slice(1).join(' ')}\n`);
			return Number(rest[0]);
		case 'stream': {
			// stream <lines> <delayMs>: one line per delay, flushed immediately, like the real exec.
			const lines = Number(rest[0] ?? 3);
			const delay = Number(rest[1] ?? 50);
			let written = 0;
			const timer = setInterval(() => {
				written += 1;
				process.stdout.write(`line ${written}\n`);
				if (written >= lines) {
					clearInterval(timer);
					process.exit(0);
				}
			}, delay);
			return undefined;
		}
		case 'hang':
			// Prints once, then waits to be killed (host-side abort); the sandbox state is left "running".
			process.stdout.write('hanging\n');
			setInterval(() => {}, 1000);
			return undefined;
		default:
			process.stderr.write(`bash: ${name}: command not found\n`);
			return 127;
	}
}

switch (verbMatch ?? argv[0]) {
	case 'ls': {
		recordCall();
		parseArgs(argv.slice(1), flagsFromHelp('help-ls'));
		if (!argv.includes('--json')) fail('sbx-mock: only `ls --json` is supported', 2);
		// Same keys as the real entry in the ls-json fixture; the mock-only bookkeeping stays in state.json.
		const list = Object.values(state.sandboxes).map(({ mock, ...entry }) => ({
			...entry,
			last_used_at: entry.created_at,
		}));
		process.stdout.write(`${JSON.stringify(list, null, 2)}\n`);
		break;
	}
	case 'diagnose': {
		recordCall();
		parseArgs(argv.slice(1), flagsFromHelp('help-diagnose'));
		process.stdout.write(
			hasScenario('diagnose-garbage') ? 'diagnose: this is not JSON\n' : `${diagnoseOutput()}\n`
		);
		break;
	}
	case 'policy ls': {
		recordCall();
		parseArgs(argv.slice(2), flagsFromHelp('help-policy-ls'));
		process.stdout.write(`${policyOutput()}\n`);
		break;
	}
	case 'settings': {
		recordCall();
		if (argv[1] !== 'ls' || !argv.includes('--json')) fail('sbx-mock: only `settings ls --json` is supported', 2);
		process.stdout.write(`${settingsOutput()}\n`);
		break;
	}
	case 'create': {
		recordCall();
		const { values, positionals } = parseArgs(argv.slice(1), flagsFromHelp('help-create'));
		const name = first(values, '--name');
		const [agent, ...mounts] = positionals;
		if (!name || !agent) fail('error: create needs --name and an agent in this mock', 2);
		if (state.sandboxes[name]) fail(`error: sandbox '${name}' already exists`); // synthetic text
		const cpus = first(values, '--cpus');
		const memory = first(values, '-m', '--memory');
		const workspaces = mounts.map(mount => mount.replace(/:ro$/, ''));
		for (const workspace of workspaces) {
			checkWindowsPath(workspace, 'workspace');
			if (!fs.existsSync(workspace)) fail(`error: workspace "${workspace}" does not exist`); // synthetic text
		}
		const mebibytes = memory ? Number.parseInt(memory, 10) * (/g$/i.test(memory) ? 1024 : 1) : undefined;
		state.sandboxes[name] = {
			name,
			id: `mock-${name}`,
			agent,
			status: 'running',
			workspaces,
			// An omitted --cpus/-m would be sbx's 20 CPUs / half of the RAM: record that so a test sees the difference.
			cpus: cpus ? Number(cpus) : 20,
			memory: memory ?? 'default',
			memory_mib: mebibytes ?? 16256,
			created_at: '2026-10-26T00:00:00Z',
			mock: {
				template: first(values, '-t', '--template') ?? null,
				pull: first(values, '--pull') ?? null,
				readOnlyMounts: mounts.filter(m => m.endsWith(':ro')),
			},
		};
		saveState(state);
		process.stdout.write(`Created sandbox '${name}'\n`); // synthetic text
		break;
	}
	case 'exec': {
		const { values, positionals, rest } = parseArgs(argv.slice(1), flagsFromHelp('help-exec'), {
			positionalLimit: 1,
		});
		const name = positionals[0];
		const env = {};
		let envFileContent = null;
		for (const file of values['--env-file'] ?? []) {
			checkWindowsPath(file, 'open env file');
			if (!fs.existsSync(file)) fail(`error: open ${file}: no such file`); // synthetic text
			envFileContent = fs.readFileSync(file, 'utf8');
			for (const line of envFileContent.split('\n').filter(Boolean)) {
				const eq = line.indexOf('=');
				env[line.slice(0, eq)] = line.slice(eq + 1);
			}
		}
		for (const pair of [...(values['-e'] ?? []), ...(values['--env'] ?? [])]) {
			const eq = pair.indexOf('=');
			env[pair.slice(0, eq)] = pair.slice(eq + 1);
		}
		recordCall({ envFileContent });
		const sandbox = requireSandbox(name);
		sandbox.status = 'running';
		saveState(state);
		if (rest.length === 0) fail('error: exec needs a command');
		const code = runPseudoCommand(sandbox, rest, first(values, '-w', '--workdir'), env);
		if (code !== undefined) process.exit(code);
		break;
	}
	case 'stop': {
		recordCall();
		const { positionals } = parseArgs(argv.slice(1), flagsFromHelp('help-stop'));
		for (const name of positionals) requireSandbox(name).status = 'stopped';
		saveState(state);
		process.stdout.write(`${positionals.join('\n')}\n`); // synthetic text
		break;
	}
	case 'rm': {
		recordCall();
		const { values, positionals } = parseArgs(argv.slice(1), flagsFromHelp('help-rm'));
		if (!values['--force'] && !values['-f'])
			fail('error: confirmation required; use --force for non-interactive use'); // synthetic text
		for (const name of positionals) {
			requireSandbox(name);
			delete state.sandboxes[name];
			// Verified on the real sbx: rules and secrets scoped to the sandbox disappear with it.
			state.rules = state.rules.filter(rule => rule.sandbox_id !== name);
			state.secrets = state.secrets.filter(secret => secret.sandbox !== name);
		}
		saveState(state);
		break;
	}
	case 'cp': {
		recordCall();
		const { positionals } = parseArgs(argv.slice(1), flagsFromHelp('help-cp'));
		const [source, destination] = positionals;
		const split = value => {
			const match = /^([A-Za-z0-9][A-Za-z0-9.-]+):(\/.*)$/.exec(value);
			return match ? { sandbox: match[1], vmPath: match[2] } : undefined;
		};
		const from = split(source);
		const to = split(destination);
		if (Boolean(from) === Boolean(to)) fail('error: either SRC or DST must be a sandbox path (SANDBOX:PATH)');
		const remote = from ?? to;
		requireSandbox(remote.sandbox);
		// The sandbox file system is simulated under the state directory.
		const vmRoot = path.join(stateDir, 'vm', remote.sandbox);
		const vmPath = path.join(vmRoot, remote.vmPath);
		if (to) {
			checkWindowsPath(source, 'copy source');
			fs.mkdirSync(path.dirname(vmPath), { recursive: true });
			fs.cpSync(source, vmPath, { recursive: true });
		} else {
			checkWindowsPath(destination, 'copy destination');
			if (!fs.existsSync(vmPath)) fail(`error: ${remote.vmPath}: no such file or directory in sandbox`); // synthetic text
			fs.cpSync(vmPath, destination, { recursive: true });
		}
		break;
	}
	case 'policy allow network': {
		recordCall();
		const { values, positionals } = parseArgs(argv.slice(3), flagsFromHelp('help-policy-allow-network'));
		const sandbox = first(values, '--sandbox');
		if (sandbox) requireSandbox(sandbox);
		// synthetic rule shape modelled on the real per-sandbox rule in the policy fixture
		state.rules.push({
			id: `mock-rule-${state.rules.length + 1}`,
			name: 'added',
			scope: sandbox ? `sandbox:${sandbox}` : 'global',
			sandbox_id: sandbox ?? undefined,
			resource_type: 'network',
			decision: 'allow',
			resources: positionals[0].split(','),
		});
		saveState(state);
		break;
	}
	case 'policy rm network': {
		recordCall();
		const { values } = parseArgs(argv.slice(3), flagsFromHelp('help-policy-rm-network'));
		const sandbox = first(values, '--sandbox');
		if (!values['--force'] && !values['-f'])
			fail('error: confirmation required; use --force for non-interactive use'); // synthetic text
		// REAL text (live run, sbx 0.49.2, 2026-10-26): removing a rule of a sandbox that no longer exists.
		if (sandbox && !state.sandboxes[sandbox]) {
			const wanted = first(values, '--resource')?.split(',') ?? [];
			const other = state.rules.find(rule => rule.resources.some(resource => wanted.includes(resource)));
			// REAL text too (live run): another sandbox holds a rule for the same resource.
			if (other) {
				const resource = other.resources.find(candidate => wanted.includes(candidate));
				fail(
					`error: remove network rule: "${resource}" is covered by rule ${other.id} in sandbox "${other.sandbox_id}", not in sandbox "${sandbox}"; run:   sbx policy rm network --id ${other.id} --sandbox ${other.sandbox_id}`
				);
			}
			fail(
				`error: remove network rule: no scoped policy found for sandbox "${sandbox}"; use "sbx policy ls --wide" to find rule IDs.`
			);
		}
		const resources = first(values, '--resource')?.split(',') ?? [];
		const before = state.rules.length;
		state.rules = state.rules.filter(
			rule => !(rule.sandbox_id === sandbox && rule.resources.some(r => resources.includes(r)))
		);
		if (state.rules.length === before) fail('error: no matching rule'); // synthetic text
		saveState(state);
		break;
	}
	case 'secret set-custom': {
		recordCall();
		const { values } = parseArgs(argv.slice(2), flagsFromHelp('help-secret-set-custom'));
		const sandbox = first(values, '--sandbox');
		if (sandbox) requireSandbox(sandbox);
		const hosts = values['--host'] ?? [];
		if (hosts.some(host => /:\d+$/.test(host))) fail('error: --host takes a host without a port'); // synthetic text, behaviour verified in the research
		state.secrets.push({
			sandbox,
			hosts,
			env: first(values, '--env'),
			placeholder: first(values, '--placeholder'),
			command: first(values, '--command'),
		});
		saveState(state);
		break;
	}
	case 'secret set': {
		recordCall();
		const { values, positionals } = parseArgs(argv.slice(2), flagsFromHelp('help-secret-set'));
		const sandbox = first(values, '--sandbox');
		// Like the real sbx 0.49.2 (observed by hand, 2026-10-26): an unknown service, an empty standard input and a
		// sandbox that does not exist are all ACCEPTED. The value is never stored, only its length.
		state.secrets.push({ sandbox, service: positionals[0], valueLength: stdinText.trim().length });
		saveState(state);
		// Text copied from the real sbx (hand capture, not in fixtures/); which stream carries "Enter secret:" is not known.
		process.stdout.write(
			`Applied secret to sandbox ${sandbox}${NL}Saved secret ${positionals[0]} (${sandbox})${NL}`
		);
		break;
	}
	case 'secret rm': {
		recordCall();
		const { values } = parseArgs(argv.slice(2), { ...flagsFromHelp('help-secret-rm'), '--placeholder': true });
		const sandbox = first(values, '--sandbox');
		if (sandbox) requireSandbox(sandbox);
		const placeholder = first(values, '--placeholder');
		const before = state.secrets.length;
		state.secrets = state.secrets.filter(
			secret => !(secret.sandbox === sandbox && secret.placeholder === placeholder)
		);
		if (state.secrets.length === before) fail('error: no matching secret'); // synthetic text
		saveState(state);
		break;
	}
	default: {
		recordCall();
		// REAL text (err-unknown-verb fixture)
		fail(`error: sbx: unknown command: sbx ${argv[0] ?? ''}\n  try: sbx --help`);
	}
}
