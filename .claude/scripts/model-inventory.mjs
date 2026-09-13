/**
 * Model inventory: which ids actually answer, per CLI.
 *
 * Sends a three-word prompt to every candidate and records what came back. No guessing from
 * catalogues or whitelists -- those are exactly what misled us: config_claude.json whitelists
 * three ids that bedrock does not have, and opencode drops unknown ids in silence.
 *
 * Usage:  node .claude/temp/model-inventory.mjs [opencode|claude|codex]...
 * Output: a table on stdout, plus inventory-result.json next to this file.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.HOME ?? process.env.USERPROFILE;

/**
 * OPENCODE_CONFIG splits on ':', so a Windows path is read as two bogus paths and the config is
 * ignored in silence -- which is what made the first run of this script report every model as
 * missing. Git Bash understands the /c/... form, which has no colon.
 */
function msysPath(windowsPath) {
	return windowsPath.replace(/^([A-Za-z]):/, (_match, drive) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
}
const MARKER = 'MODEL_OK';
const PROMPT = `Reply with exactly: ${MARKER}`;
const PER_CALL_TIMEOUT_MS = 180_000;

/** Bedrock inference profiles for the claude account, from `aws bedrock list-inference-profiles`. */
const BEDROCK_CLAUDE = [
	{ label: 'haiku-4-5', id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0' },
	{ label: 'sonnet-4-5', id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0' },
	{ label: 'sonnet-4-6', id: 'us.anthropic.claude-sonnet-4-6' },
	{ label: 'sonnet-5', id: 'us.anthropic.claude-sonnet-5' },
	{ label: 'opus-4-6', id: 'us.anthropic.claude-opus-4-6-v1' },
	{ label: 'opus-4-7', id: 'us.anthropic.claude-opus-4-7' },
	{ label: 'opus-4-8', id: 'us.anthropic.claude-opus-4-8' },
	{ label: 'opus-5', id: 'us.anthropic.claude-opus-5' },
	{ label: 'fable-5', id: 'us.anthropic.claude-fable-5' },
	{ label: 'fable-5-1', id: 'us.anthropic.claude-fable-5-1' },
];

/** The short ids config_claude.json whitelists today, tested as-is to prove why they fail. */
const OPENCODE_SHORT_IDS = [
	{ label: 'haiku-4-5 (short)', id: 'anthropic.claude-haiku-4-5' },
	{ label: 'sonnet-4-6 (short)', id: 'anthropic.claude-sonnet-4-6' },
];

function run(command, args, env = {}) {
	// bash, not cmd.exe: the CLIs live on the MSYS PATH, and OPENCODE_CONFIG only resolves for
	// opencode when the value goes through the same shell that resolves /c/... paths. Spawning
	// through cmd.exe made every model look absent because the config was silently not loaded.
	const result = spawnSync('bash', ['-c', [command, ...args].join(' ')], {
		encoding: 'utf8',
		timeout: PER_CALL_TIMEOUT_MS,
		env: { ...process.env, ...env },
	});
	const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
	return { ok: output.includes(MARKER), output, status: result.status };
}

/** One line of explanation for a failure, from the noisiest error the CLI printed. */
function explain(rawOutput) {
	// ANSI codes and pretty-printed JSON otherwise truncate the message to "Error: {".
	const output = rawOutput.replace(/\[[0-9;]*m/g, '');
	const patterns = [
		/ProviderModelNotFoundError: [^\n"]{0,120}/,
		/ModelNotFoundError: [^\n"]{0,120}/,
		/The provided model identifier is invalid[^\n"]{0,60}/,
		/AccessDenied[^\n"]{0,100}/,
		/ValidationException[^\n"]{0,100}/,
		/ThrottlingException[^\n"]{0,80}/,
		/ExpiredToken[^\n"]{0,80}/,
		/"message":\s*"([^"]{0,120})"/,
		/Error: [^\n"{]{1,100}/,
	];
	for (const pattern of patterns) {
		const match = pattern.exec(output);
		if (match) return match[0].replace(/\s+/g, ' ').trim();
	}
	return 'no MODEL_OK in output, and no recognised error';
}

/** A config declaring every candidate, so opencode's catalogue cannot hide one. */
function writeOpenCodeConfig(candidates) {
	const models = {};
	for (const candidate of candidates) models[candidate.id] = { name: candidate.label };
	const config = {
		$schema: 'https://opencode.ai/config.json',
		enabled_providers: ['amazon-bedrock'],
		provider: {
			'amazon-bedrock': {
				options: { region: 'us-east-1', profile: 'cloudbees-bedrock-claude-infra-bedrock-claude-user' },
				models,
				// Both halves are needed, established the hard way: `models` alone leaves `us.`
				// prefixed ids out of `opencode models`, and a whitelist alone cannot introduce an
				// id the catalogue does not already know.
				whitelist: candidates.map(candidate => candidate.id),
			},
		},
		model: 'amazon-bedrock/anthropic.claude-sonnet-4-6',
	};
	// Written to HOME: OPENCODE_CONFIG splits on ':', so a Windows C:/... path is read as two
	// bogus paths and the file is ignored without a word.
	const path = join(HOME, 'opencode-inventory.json');
	writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
	return path;
}

function inventoryOpenCode() {
	const candidates = [...BEDROCK_CLAUDE, ...OPENCODE_SHORT_IDS];
	const configPath = writeOpenCodeConfig(candidates);
	const env = { OPENCODE_CONFIG: msysPath(configPath) };

	const listed = run('opencode', ['models'], env).output;
	return candidates.map(candidate => {
		const inRegistry = listed.includes(candidate.id);
		const result = run('opencode', ['run', '-m', `amazon-bedrock/${candidate.id}`, `"${PROMPT}"`], env);
		return {
			cli: 'opencode',
			label: candidate.label,
			id: candidate.id,
			declared: true,
			inRegistry,
			ok: result.ok,
			why: result.ok ? '' : explain(result.output),
		};
	});
}

function inventoryClaude() {
	// Aliases first: this is what a flow step would most naturally write.
	const aliases = ['haiku', 'sonnet', 'opus'].map(alias => ({ label: `alias ${alias}`, id: alias }));
	const explicit = BEDROCK_CLAUDE.map(candidate => ({ label: candidate.label, id: candidate.id }));

	return [...aliases, ...explicit].map(candidate => {
		const result = run('claude', ['--model', candidate.id, '-p', '--dangerously-skip-permissions', `"${PROMPT}"`]);
		return {
			cli: 'claude',
			label: candidate.label,
			id: candidate.id,
			ok: result.ok,
			why: result.ok ? '' : explain(result.output),
		};
	});
}

function inventoryCodex() {
	// The codex account is a different bedrock profile, OpenAI models only.
	const candidates = [
		{ label: 'configured default', id: '' },
		{ label: 'gpt-5.6-terra', id: 'openai.gpt-5.6-terra' },
		{ label: 'gpt-5.5', id: 'openai.gpt-5.5' },
		{ label: 'gpt-5.6', id: 'openai.gpt-5.6' },
	];

	return candidates.map(candidate => {
		const args = ['exec', '--skip-git-repo-check'];
		if (candidate.id !== '') args.push('-m', candidate.id);
		args.push(`"${PROMPT}"`);
		const result = run('codex', args);
		return {
			cli: 'codex',
			label: candidate.label,
			id: candidate.id || '(from ~/.codex/config.toml)',
			ok: result.ok,
			why: result.ok ? '' : explain(result.output),
		};
	});
}

const requested = process.argv.slice(2);
const wanted = requested.length > 0 ? requested : ['opencode', 'claude', 'codex'];
const rows = [];

for (const cli of wanted) {
	process.stdout.write(`\n=== ${cli} ===\n`);
	const runner = { opencode: inventoryOpenCode, claude: inventoryClaude, codex: inventoryCodex }[cli];
	if (!runner) throw new Error(`Unknown CLI "${cli}" -- expected opencode, claude or codex`);
	for (const row of runner()) {
		rows.push(row);
		const status = row.ok ? 'OK  ' : 'FAIL';
		const registry = row.inRegistry === false ? ' [not in registry]' : '';
		process.stdout.write(`${status} ${row.label.padEnd(22)} ${row.id}${registry}\n`);
		if (!row.ok) process.stdout.write(`     -> ${row.why}\n`);
	}
}

writeFileSync(join(HERE, 'inventory-result.json'), JSON.stringify(rows, null, 2), 'utf8');
process.stdout.write(`\nWrote ${String(rows.length)} results to .claude/temp/inventory-result.json\n`);
