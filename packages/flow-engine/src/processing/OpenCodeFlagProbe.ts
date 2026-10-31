/**
 * Asks the resolved opencode binary which flags `run` accepts, before a step starts.
 *
 * Why: two opencode installs can coexist and an older one lacks flags the provider sends (`--auto`).
 * It then prints its usage screen and exits 1, a failure that never names the real cause. The probe
 * is `<bin> run --help` (no model call), run once per binary path and remembered in memory.
 * A help that cannot be read fails the step too: proceeding blind is how the problem stayed hidden.
 */
import type { ChildProcess } from 'node:child_process';

import type { ResolvedOpenCodeCommand } from './OpenCodeBinaryResolver';
import type { ProcessLauncher } from './ProcessLauncher';

export interface RequiredFlag {
	flag: string;
	/** What the provider sends it for, shown to the user when the flag is missing. */
	neededFor: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const REMEDY = 'Update with "npm i -g opencode-ai@latest"';

interface Capture {
	output: string;
	exitCode: number | null;
	startError?: string;
}

export class OpenCodeFlagProbe {
	/** Help text per binary path; only successful reads are kept. */
	private readonly helpByBinary = new Map<string, string>();

	constructor(
		private readonly launcher: ProcessLauncher,
		private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
	) {}

	/** @throws Error naming version, path, missing flag, purpose and remedy. Nothing is spawned for a mock or an empty list. */
	public async assertSupports(
		resolved: ResolvedOpenCodeCommand,
		required: readonly RequiredFlag[],
		env: Record<string, string>
	): Promise<void> {
		if (resolved.isMock || required.length === 0) return;

		const binary = resolved.parts.join(' ');
		let help = this.helpByBinary.get(binary);
		if (help === undefined) {
			const capture = await this.run(resolved, ['run', '--help'], env);
			if (capture.startError !== undefined || capture.output.trim() === '') {
				throw new Error(await this.unreadableMessage(resolved, binary, capture, env));
			}
			help = capture.output;
			this.helpByBinary.set(binary, help);
		}

		const missing = required.filter(({ flag }) => !listsFlag(help, flag));
		if (missing.length > 0) {
			throw new Error(await this.missingMessage(resolved, binary, missing, env));
		}
	}

	private async unreadableMessage(
		resolved: ResolvedOpenCodeCommand,
		binary: string,
		capture: Capture,
		env: Record<string, string>
	): Promise<string> {
		const reason = capture.startError ?? `exit code ${String(capture.exitCode)} and no output on stdout or stderr`;
		return (
			`opencode could not read the flags of "${binary}": "run --help" gave ${reason}. ` +
			`Version: ${await this.version(resolved, env)}. The step was not started because its flags cannot be verified. ` +
			`Check that this binary runs ("${binary} --version"), or ${REMEDY.toLowerCase()}.${this.otherInstalls()}`
		);
	}

	private async missingMessage(
		resolved: ResolvedOpenCodeCommand,
		binary: string,
		missing: readonly RequiredFlag[],
		env: Record<string, string>
	): Promise<string> {
		const flags = missing.map(m => `${m.flag} (needed for ${m.neededFor})`).join(', ');
		return (
			`The installed opencode does not support ${flags}. ` +
			`Binary: ${binary}, version: ${await this.version(resolved, env)}. ` +
			`The step was not started: an opencode without it prints its usage screen and exits 1. ` +
			`${REMEDY}, then check which install wins on PATH.${this.otherInstalls()}`
		);
	}

	/** The `--version` output, or the reason it could not be read (never throws). */
	private async version(resolved: ResolvedOpenCodeCommand, env: Record<string, string>): Promise<string> {
		const capture = await this.run(resolved, ['--version'], env);
		if (capture.startError !== undefined) return `unknown (${capture.startError})`;
		const text = capture.output.trim();
		return text === '' ? `unknown (--version exit code ${String(capture.exitCode)}, no output)` : text;
	}

	/** Names every opencode on PATH when there are several, as the first one wins. Empty when unknown or single. */
	private otherInstalls(): string {
		const command = process.platform === 'win32' ? 'where.exe opencode* 2>nul' : 'which -a opencode';
		try {
			const found = this.launcher
				.lookupExecutable(command)
				.split(/\r?\n/)
				.map(line => line.trim())
				.filter(Boolean);
			if (found.length < 2) return '';
			return ` Several opencode installs are on PATH (${found.join('; ')}): remove or reorder the older one so the updated one wins.`;
		} catch {
			return '';
		}
	}

	private run(resolved: ResolvedOpenCodeCommand, args: string[], env: Record<string, string>): Promise<Capture> {
		return new Promise<Capture>(resolve => {
			const [command, ...prefix] = resolved.parts;
			let output = '';
			let settled = false;
			let child: ChildProcess | undefined;
			const finish = (capture: Capture): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(capture);
			};
			const timer = setTimeout(() => {
				child?.kill();
				finish({ output, exitCode: null, startError: `no answer within ${this.timeoutMs} ms` });
			}, this.timeoutMs);
			try {
				child = this.launcher.spawn(command!, [...prefix, ...args], {
					stdio: ['ignore', 'pipe', 'pipe'],
					shell: resolved.needsShell,
					windowsHide: true,
					env,
				});
			} catch (error) {
				finish({ output, exitCode: null, startError: error instanceof Error ? error.message : String(error) });
				return;
			}
			child.stdout?.on('data', (data: Buffer) => (output += data.toString()));
			child.stderr?.on('data', (data: Buffer) => (output += data.toString()));
			child.on('error', error => finish({ output, exitCode: null, startError: error.message }));
			// 'close' (not 'exit') so the output is complete; --help starts no backend server holding the pipes
			child.on('close', code => finish({ output, exitCode: code }));
		});
	}
}

/** `--auto` must not match inside `--auto-approve`. */
function listsFlag(help: string, flag: string): boolean {
	const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(help);
}
