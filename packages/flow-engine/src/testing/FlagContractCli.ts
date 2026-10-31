/**
 * Support for processing/ProviderFlagContract.test.ts: which CLIs may be absent, and where the CLI
 * under test really lives. Every contract failure names the resolved path and `--version`, because
 * two installs of the same CLI can coexist and the one the test sees must be identifiable.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DefaultProcessLauncher } from '../processing/DefaultProcessLauncher';
import { resolveOpenCodeCommand } from '../processing/OpenCodeBinaryResolver';
import type { ProcessLauncher } from '../processing/ProcessLauncher';
import { findRepoRoot } from './VersionBaseline';

export const ALLOW_MISSING_VARIABLE = 'FLAG_CONTRACT_ALLOW_MISSING';

interface MockDriftScript {
	CLIS: { name: string }[];
	parseAllowMissing: (value: string | undefined) => string[];
}

/**
 * CLIs the contract may skip because they are not installed. Same syntax and parser as
 * MOCK_DRIFT_ALLOW_MISSING (scripts/check-mock-drift.js).
 * @throws on an unknown name, so a typo never silently disables a check
 */
export async function readAllowMissing(env: NodeJS.ProcessEnv): Promise<Set<string>> {
	const script = (await import(
		/* @vite-ignore */ pathToFileURL(join(findRepoRoot(__dirname), 'scripts', 'check-mock-drift.js')).href
	)) as MockDriftScript;
	const names = script.parseAllowMissing(env[ALLOW_MISSING_VARIABLE]);
	const known = script.CLIS.map(c => c.name);
	const unknown = names.filter(name => !known.includes(name));
	if (unknown.length > 0) {
		throw new Error(
			`${ALLOW_MISSING_VARIABLE}: unknown CLI "${unknown.join('", "')}" (known: ${known.join(', ')})`
		);
	}
	return new Set(names);
}

export interface CliHelp {
	/** The help output; undefined when the CLI could not be run or printed nothing. */
	help: string | undefined;
	/** Resolved executable and `--version`, for every failure message. */
	install: string;
}

/** Runs `<cli> <helpArgs>`; opencode is resolved exactly as OpenCodeModelProvider does. */
export function readCliHelp(
	cli: string,
	helpArgs: string[],
	launcher: ProcessLauncher = new DefaultProcessLauncher()
): CliHelp {
	const run = (args: string[]) => runCli(cli, args, launcher);
	const result = run(helpArgs);
	const output = `${result.stdout}${result.stderr}`;
	const version = run(['--version']);
	const versionText = `${version.stdout}${version.stderr}`.trim();
	return {
		// A shell answers an absent CLI with its own "not recognized" text and a non-zero status: never mistake it for help
		help: result.error !== undefined || result.status !== 0 || output.trim() === '' ? undefined : output,
		install: `resolved to ${result.executable}, --version: ${versionText === '' ? `unreadable (${version.error?.message ?? `exit ${String(version.status)}`})` : versionText}`,
	};
}

interface CliRun {
	executable: string;
	stdout: string;
	stderr: string;
	status: number | null;
	error: Error | undefined;
}

function runCli(cli: string, args: string[], launcher: ProcessLauncher): CliRun {
	let command = cli;
	let prefix: string[] = [];
	let shell = true;
	let executable = `${cli} (first on PATH${whereFirst(cli, launcher)})`;
	if (cli === 'opencode') {
		const resolved = resolveOpenCodeCommand(process.env, launcher);
		[command, ...prefix] = resolved.parts as [string, ...string[]];
		shell = resolved.needsShell;
		executable = resolved.parts.join(' ');
	}
	const result = spawnSync(command, [...prefix, ...args], {
		encoding: 'utf8',
		timeout: 60_000,
		shell,
		windowsHide: true,
	});
	return {
		executable,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		status: result.status,
		error: result.error,
	};
}

function whereFirst(cli: string, launcher: ProcessLauncher): string {
	try {
		const command = process.platform === 'win32' ? `where.exe ${cli} 2>nul` : `which ${cli}`;
		const first = launcher.lookupExecutable(command).split(/\r?\n/)[0]?.trim();
		return first ? `: ${first}` : ': not found';
	} catch {
		return ': not found';
	}
}

/** Message of the failure raised when a CLI is absent and not acknowledged. */
export function missingCliMessage(cli: string, helpArgs: string[], install: string): string {
	return (
		`${cli} cannot be checked: "${cli} ${helpArgs.join(' ')}" could not be read (${install}). ` +
		`Install ${cli}, or acknowledge its absence on this machine with ${ALLOW_MISSING_VARIABLE}=${cli} (comma-separated for several).`
	);
}

const announced = new Set<string>();

/** Logs once per CLI that its flags were not verified. */
export function announceSkippedOnce(cli: string): void {
	if (announced.has(cli)) return;
	announced.add(cli);
	console.warn(`[flag contract] ${cli} NOT VERIFIED: skipped because ${ALLOW_MISSING_VARIABLE} lists it`);
}
