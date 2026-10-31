/**
 * Do the flags we send still exist in the installed CLIs?
 *
 * This exists because `--resume` drifted to `--session` in opencode and nothing noticed for
 * months. The provider unit tests assert we *build* the flag we intend; the integration tests
 * run against mock CLIs that accept anything. Neither can see a real CLI renaming a flag.
 *
 * Deliberately reads `--help` and nothing else: no model call, no token spend, no network, so
 * it can run on every commit rather than only when a version changes. A flag we emit that the
 * CLI no longer lists is a hard failure -- sending it means the step dies with a usage screen
 * before the model is ever reached.
 *
 * A CLI that cannot be run FAILS the suite, naming the resolved path and `--version`. It is skipped
 * only when FLAG_CONTRACT_ALLOW_MISSING lists it (e.g. `opencode,codex`, same syntax as
 * MOCK_DRIFT_ALLOW_MISSING), and that skip is logged once. opencode is resolved exactly as
 * OpenCodeModelProvider does (OpenCodeBinaryResolver), not by whichever `opencode` is first in PATH.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	ALLOW_MISSING_VARIABLE,
	announceSkippedOnce,
	missingCliMessage,
	readAllowMissing,
	readCliHelp,
} from '../testing/FlagContractCli';
import { RealCodexCommand } from '../testing/RealCodexCommand';
import { CodexModelProvider } from './CodexModelProvider';
import type { LaunchOptions } from './ModelProvider';

/** Flags each provider can put on the command line, and where they come from. */
const PROVIDER_FLAGS: { cli: string; helpArgs: string[]; source: string; flags: string[] }[] = [
	{
		cli: 'opencode',
		helpArgs: ['run', '--help'],
		source: 'OpenCodeModelProvider.buildSpawnParams',
		flags: ['--format', '--auto', '-m', '--session'],
	},
	{
		cli: 'claude',
		helpArgs: ['--help'],
		source: 'ClaudeLauncher.buildArgs',
		flags: [
			'--mcp-config',
			'--settings',
			'--include-hook-events',
			'--dangerously-skip-permissions',
			'--output-format',
			'--verbose',
			'--model',
			'--resume',
			'-p',
			'--tools',
		],
	},
	{
		cli: 'codex',
		helpArgs: ['exec', '--help'],
		source: 'CodexModelProvider.buildSpawnParams',
		// `resume` is a subcommand rather than a flag, and appears in the same help output.
		flags: [
			'--json',
			'--skip-git-repo-check',
			'-m',
			'--approve-for-me',
			'resume',
			'--sandbox',
			// MCP servers, hooks, web search and the sandbox on resume all travel as `-c` overrides
			'-c',
			'--disable',
			'--dangerously-bypass-hook-trust',
		],
	},
	{
		// The resume subcommand takes fewer flags than a fresh run: no --sandbox, no --approve-for-me.
		// The provider sends those settings as -c overrides there.
		cli: 'codex',
		helpArgs: ['exec', 'resume', '--help'],
		source: 'CodexModelProvider.prepare (resume)',
		flags: ['--json', '--skip-git-repo-check', '-m', '-c', '--disable', '--dangerously-bypass-hook-trust'],
	},
	{
		// Interactive launch is the TUI, which has neither --json nor --skip-git-repo-check
		cli: 'codex',
		helpArgs: ['--help'],
		source: 'CodexModelProvider.prepare (interactive)',
		flags: ['-m', '-c', '--disable', '--sandbox', '--approve-for-me', '--dangerously-bypass-hook-trust', 'resume'],
	},
	{
		cli: 'codex',
		helpArgs: ['resume', '--help'],
		source: 'CodexModelProvider.prepare (interactive resume)',
		flags: ['-m', '-c', '--disable', '--sandbox', '--approve-for-me', '--dangerously-bypass-hook-trust'],
	},
];

const allowMissing = await readAllowMissing(process.env);

describe.each(PROVIDER_FLAGS)('$cli accepts every flag $source sends', ({ cli, helpArgs, flags }) => {
	const { help, install } = readCliHelp(cli, helpArgs);

	if (help === undefined && allowMissing.has(cli)) {
		announceSkippedOnce(cli);
		it.skip(`${cli} flags NOT VERIFIED: ${ALLOW_MISSING_VARIABLE} lists ${cli}`, () => undefined);
		return;
	}

	it('lists all of them in its help', () => {
		if (help === undefined) throw new Error(missingCliMessage(cli, helpArgs, install));
		const missing = flags.filter(flag => !help.includes(flag));

		expect(
			missing,
			`${cli} no longer lists: ${missing.join(', ')} (${install}). A step sending these dies on a usage screen before reaching the model. Check "${cli} ${helpArgs.join(' ')}" and update the provider.`
		).toEqual([]);
	});
});

/**
 * The `-c` overrides and feature switches the codex provider builds, replayed against the real CLI's
 * config loader (`codex mcp list` loads the full config, with no model call). codex rejects a bad key
 * or value there -- but it also treats a value that is not valid TOML as a literal string, so a
 * malformed override would otherwise only show up as a silently wrong setting. For MCP servers the
 * loaded result is compared with what was asked for.
 */
describe('codex config overrides are loaded by the real CLI', () => {
	const codexHelp = readCliHelp('codex', ['--help']);
	const codexAvailable = codexHelp.help !== undefined;
	const codexSkipped = !codexAvailable && allowMissing.has('codex');
	if (codexSkipped) announceSkippedOnce('codex');
	// Absent and not acknowledged: one failing test says so, instead of every test below skipping
	if (!codexAvailable && !codexSkipped) {
		it('needs codex to replay the config overrides', () => {
			throw new Error(missingCliMessage('codex', ['--help'], codexHelp.install));
		});
	}
	const itWithCodex = codexAvailable ? it : it.skip;

	/** Runs the provider against a recorder that writes its argv to a file instead of calling a model. */
	async function recordedArgs(overrides: Partial<LaunchOptions>): Promise<string[]> {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-contract-'));
		try {
			const recorder = path.join(dir, 'recorder.mjs');
			const recordFile = path.join(dir, 'argv.json');
			fs.writeFileSync(
				recorder,
				"import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.RECORD_FILE, JSON.stringify(process.argv.slice(2)));\n"
			);
			await new CodexModelProvider().launchBackground({
				workingDir: dir,
				prompt: 'p',
				stepId: 'contract',
				env: { CODEX_MOCK_PATH: recorder, RECORD_FILE: recordFile },
				...overrides,
			});
			return JSON.parse(fs.readFileSync(recordFile, 'utf8')) as string[];
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}

	/** Only what `codex mcp list` accepts: the -c overrides and the feature switches. */
	function configArgs(args: string[]): string[] {
		const kept: string[] = [];
		for (let i = 0; i < args.length; i++) {
			if (args[i] === '--') break;
			if (['-c', '--enable', '--disable'].includes(args[i]!)) {
				kept.push(args[i]!, args[++i]!);
			}
		}
		return kept;
	}

	function loadConfig(args: string[]): { status: number | null; stdout: string; stderr: string } {
		const { command, prefix } = RealCodexCommand.resolve();
		const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-contract-home-'));
		try {
			const result = spawnSync(command, [...prefix, 'mcp', 'list', '--json', ...configArgs(args)], {
				encoding: 'utf8',
				timeout: 60_000,
				// An empty CODEX_HOME: the user's own servers and settings must not leak into the comparison
				env: { ...process.env, CODEX_HOME: codexHome },
			});
			return { status: result.status, stdout: result.stdout, stderr: result.stderr };
		} finally {
			fs.rmSync(codexHome, { recursive: true, force: true });
		}
	}

	const awkward = 'a "quoted" \\ back\\slash, [bracket] {brace} = eq # hash';

	itWithCodex(
		'loads MCP servers, hooks and the read-only restriction, and reports MCP servers back as asked',
		async () => {
			const args = await recordedArgs({
				tools: ['read'],
				model: 'openai.gpt-5.6-terra',
				mcpServers: [
					{
						name: 'with-everything',
						command: ['node', 'C:\\path\\srv.js', awkward],
						env: { A_KEY: awkward },
						cwd: 'C:\\work',
					},
					{ name: 'off', command: ['node'], enabled: false },
				],
				toolHooks: [
					{ timing: 'before', action: { type: 'deny', reason: 'r', toolPattern: 'bash' } },
					{ timing: 'after', action: { type: 'log' } },
				],
			});

			const loaded = loadConfig(args);
			expect(loaded.status, loaded.stdout + loaded.stderr).toBe(0);
			const servers = JSON.parse(loaded.stdout) as {
				name: string;
				enabled: boolean;
				transport: { command: string; args: string[]; env: Record<string, string>; cwd: string };
			}[];
			const full = servers.find(s => s.name === 'with-everything')!;
			expect(full.enabled).toBe(true);
			expect(full.transport).toMatchObject({
				command: 'node',
				args: ['C:\\path\\srv.js', awkward],
				env: { A_KEY: awkward },
				cwd: 'C:\\work',
			});
			expect(servers.find(s => s.name === 'off')?.enabled).toBe(false);
		}
	);

	itWithCodex('loads the web-search and shell switches', async () => {
		const args = await recordedArgs({ tools: ['read', 'write', 'edit'] });

		expect(args).toContain('--disable');
		const loaded = loadConfig(args);
		expect(loaded.status, loaded.stdout + loaded.stderr).toBe(0);
	});

	itWithCodex('loads the resume-form permission overrides', async () => {
		const args = await recordedArgs({ resumeSessionId: 'abc-123', skipPermissions: true });

		const loaded = loadConfig(args);
		expect(args.join(' ')).toContain('approvals_reviewer');
		expect(loaded.status, loaded.stdout + loaded.stderr).toBe(0);
	});

	// Without this the checks above could pass because codex accepts anything
	itWithCodex('really does reject an invalid value (control)', () => {
		const loaded = loadConfig(['-c', 'sandbox_mode="not-a-sandbox"']);

		expect(loaded.status).not.toBe(0);
	});
});
