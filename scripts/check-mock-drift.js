#!/usr/bin/env node

/**
 * Mock drift check -- fails loudly when an installed LLM CLI (claude, opencode, codex) is not the
 * version its mock was last confirmed against. Full procedure: .claude/docs/mock-fidelity.md
 *
 * Usage:
 *   node scripts/check-mock-drift.js                verify: exit 1 on any drift / missing CLI / unreadable version
 *   node scripts/check-mock-drift.js --status       print the table, always exit 0
 *   node scripts/check-mock-drift.js --run          run the real-vs-mock suite of each drifted CLI (REAL TOKENS), then re-verify
 *   node scripts/check-mock-drift.js --cache-dir D  read <cli>-version-tested.json from D (default: <repo>/.claude)
 *
 * Env:
 *   CI                              set -> skipped (CI never runs real CLIs)
 *   MOCK_DRIFT_ALLOW_MISSING=a,b    CLIs allowed to be absent on this machine (reported as WARN, not failure)
 *
 * It only READS the cache. The version is recorded by the suite itself, after a full green run.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Probe commands and version parsers mirror currentXVersion() in the three
 * packages/flow-engine/src/executor/StepRunner.*.integration.test.ts files: the cached string must
 * be byte-identical to what the suite records, so keep them in sync.
 */
export const CLIS = [
	{
		name: 'claude',
		forceEnvVar: 'CLAUDE_INTEGRATION',
		suite: 'StepRunner.model.integration.test',
		parse: output => (/^\d+\.\d+\.\d+/.test(output) ? output : null),
	},
	{
		name: 'opencode',
		forceEnvVar: 'OPENCODE_INTEGRATION',
		suite: 'StepRunner.opencode.integration.test',
		parse: output => {
			const version = output.split('\n').at(-1)?.trim() ?? '';
			return /^\d+\.\d+\.\d+/.test(version) ? version : null;
		},
	},
	{
		name: 'codex',
		forceEnvVar: 'CODEX_INTEGRATION',
		suite: 'StepRunner.codex.integration.test',
		parse: output => (/^codex-cli \d+\.\d+\.\d+/.test(output) ? output : null),
	},
];

export const STATE = {
	OK: 'OK',
	DRIFT: 'DRIFT',
	NEVER_VERIFIED: 'NEVER-VERIFIED',
	NOT_INSTALLED: 'NOT-INSTALLED',
	UNPARSABLE: 'UNPARSABLE',
	CACHE_UNREADABLE: 'CACHE-UNREADABLE',
};

/** Installed-version probe: `{ raw }` on success, `{ error }` when the command fails. */
export function probeInstalled(cliName) {
	try {
		const raw = execSync(`${cliName} --version`, {
			encoding: 'utf8',
			timeout: 30_000,
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
		return { raw };
	} catch (err) {
		return { error: err instanceof Error ? err.message.split('\n')[0] : String(err) };
	}
}

/** Cached version: `{ version }` (null when no file), or `{ error }` when the file exists but is unusable. */
export function readCache(cacheDir, cliName) {
	const file = join(cacheDir, `${cliName}-version-tested.json`);
	if (!existsSync(file)) return { version: null, file };
	try {
		const parsed = JSON.parse(readFileSync(file, 'utf8'));
		if (typeof parsed.testedVersion !== 'string') return { error: 'no string "testedVersion" field', file };
		return { version: parsed.testedVersion, testedAt: parsed.testedAt, file };
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err), file };
	}
}

/** Shell command (bash syntax) that re-verifies one CLI and records its version on success. */
export function verifyCommand(cli) {
	return `${cli.forceEnvVar}=1 npm run test --workspace=flow-engine -- ${cli.suite}`;
}

/** Pure classification of one CLI. `probe` and `cache` are the results of probeInstalled / readCache. */
export function evaluate(cli, probe, cache, allowMissing = []) {
	const base = { name: cli.name, cached: cache.version ?? null, command: verifyCommand(cli) };
	if (probe.error !== undefined) {
		const allowed = allowMissing.includes(cli.name);
		const hint = allowed
			? 'acknowledged by MOCK_DRIFT_ALLOW_MISSING'
			: `install it, or acknowledge with MOCK_DRIFT_ALLOW_MISSING=${cli.name}`;
		return {
			...base,
			installed: null,
			state: STATE.NOT_INSTALLED,
			ok: allowed,
			detail: `\`${cli.name} --version\` failed (${probe.error}); ${hint}`,
		};
	}
	const installed = cli.parse(probe.raw);
	if (installed === null) {
		return {
			...base,
			installed: null,
			state: STATE.UNPARSABLE,
			ok: false,
			detail: `unexpected \`${cli.name} --version\` output ${JSON.stringify(probe.raw.slice(0, 120))}; update the parser here and in ${cli.suite}.ts`,
		};
	}
	if (cache.error !== undefined) {
		return {
			...base,
			installed,
			state: STATE.CACHE_UNREADABLE,
			ok: false,
			detail: `${cache.file}: ${cache.error}`,
		};
	}
	if (cache.version === null) {
		return {
			...base,
			installed,
			state: STATE.NEVER_VERIFIED,
			ok: false,
			detail: `no ${cache.file}; mock never confirmed`,
		};
	}
	if (cache.version !== installed) {
		return {
			...base,
			installed,
			state: STATE.DRIFT,
			ok: false,
			detail: `mock confirmed against "${cache.version}"`,
		};
	}
	return {
		...base,
		installed,
		state: STATE.OK,
		ok: true,
		detail: cache.testedAt ? `verified ${cache.testedAt}` : '',
	};
}

export function checkAll(cacheDir, { probe = probeInstalled, allowMissing = [] } = {}) {
	return CLIS.map(cli => evaluate(cli, probe(cli.name), readCache(cacheDir, cli.name), allowMissing));
}

export function parseAllowMissing(value) {
	return (value ?? '')
		.split(',')
		.map(s => s.trim())
		.filter(Boolean);
}

/** Throws on a name that is not a known CLI, so a typo in MOCK_DRIFT_ALLOW_MISSING is never silent. */
export function validateAllowMissing(names) {
	const known = CLIS.map(c => c.name);
	const unknown = names.filter(n => !known.includes(n));
	if (unknown.length > 0) {
		throw new Error(`MOCK_DRIFT_ALLOW_MISSING: unknown CLI "${unknown.join('", "')}" (known: ${known.join(', ')})`);
	}
}

export function formatReport(results) {
	const lines = ['Mock fidelity (installed CLI vs version the mock was last confirmed against):'];
	for (const r of results) {
		const label = r.ok && r.state !== STATE.OK ? 'WARN' : r.state;
		lines.push(`  ${r.name.padEnd(9)} ${label.padEnd(15)} installed=${r.installed ?? '-'}  ${r.detail}`.trimEnd());
	}
	const bad = results.filter(r => !r.ok);
	if (bad.length > 0) {
		lines.push('', 'The runs below spend real tokens. After a green run the suite records the new version.');
		for (const r of bad) {
			lines.push(`  ${r.name}: ${r.command}`);
		}
		lines.push('  or all drifted CLIs at once: npm run mocks:verify:run');
		lines.push(
			'  If a run fails, update the mock to match the new real behaviour (.claude/docs/mock-fidelity.md).'
		);
	}
	return lines.join('\n');
}

function runDriftedSuites(results) {
	for (const r of results.filter(x => !x.ok && x.installed !== null)) {
		const cli = CLIS.find(c => c.name === r.name);
		console.log(`\n>>> ${r.name}: running real-vs-mock suite (spends tokens): ${r.command}`);
		const run = spawnSync('npm', ['run', 'test', '--workspace=flow-engine', '--', cli.suite], {
			cwd: REPO_ROOT,
			shell: true,
			stdio: 'inherit',
			env: { ...process.env, [cli.forceEnvVar]: '1' },
		});
		if (run.status !== 0) console.log(`>>> ${r.name}: suite FAILED (exit ${run.status}); version not recorded`);
	}
}

/** Returns the process exit code: 0 ok, 1 drift/missing, 2 usage error. */
export function main(argv, env) {
	if (env.CI) {
		console.log('Mock fidelity check skipped: CI is set (CI never runs real CLIs).');
		return 0;
	}
	const cacheIndex = argv.indexOf('--cache-dir');
	if (cacheIndex !== -1 && !argv[cacheIndex + 1]) {
		console.error('--cache-dir needs a directory argument');
		return 2;
	}
	const cacheDir = cacheIndex !== -1 ? argv[cacheIndex + 1] : join(REPO_ROOT, '.claude');
	const known = new Set(['--status', '--run', '--cache-dir', cacheDir]);
	const unknownArgs = argv.filter(a => !known.has(a));
	if (unknownArgs.length > 0) {
		console.error(
			`Unknown argument(s): ${unknownArgs.join(' ')}. Usage: see header of scripts/check-mock-drift.js`
		);
		return 2;
	}
	let allowMissing;
	try {
		allowMissing = parseAllowMissing(env.MOCK_DRIFT_ALLOW_MISSING);
		validateAllowMissing(allowMissing);
	} catch (err) {
		console.error(err.message);
		return 2;
	}

	let results = checkAll(cacheDir, { allowMissing });
	if (argv.includes('--run') && results.some(r => !r.ok)) {
		runDriftedSuites(results);
		results = checkAll(cacheDir, { allowMissing });
	}
	console.log(formatReport(results));
	if (argv.includes('--status')) return 0;
	const failed = results.filter(r => !r.ok);
	if (failed.length > 0) {
		console.error(
			`\n✗ Mock drift: ${failed.map(r => r.name).join(', ')} not confirmed against the installed version.`
		);
		return 1;
	}
	console.log('✓ mocks up to date');
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exit(main(process.argv.slice(2), process.env));
}
