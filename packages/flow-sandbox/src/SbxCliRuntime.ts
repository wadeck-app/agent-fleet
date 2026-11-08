import * as os from 'node:os';

import { HostPathFormatter } from './HostPathFormatter';
import { PINNED_SBX_VERSION, sbxReleaseUrl } from './PinnedSbxVersion';
import { PrivateEnvFile } from './PrivateEnvFile';
import { SandboxError } from './SandboxError';
import { SandboxRequestValidator } from './SandboxRequestValidator';
import type {
	CopyInRequest,
	CopyOutRequest,
	CreateSandboxRequest,
	ExecRequest,
	ExecResult,
	NetworkRuleRequest,
	SandboxInfo,
	SandboxRuntime,
	SecretRemoveRequest,
	SecretRequest,
	ServiceSecretRequest,
} from './SandboxRuntime';
import { type SbxBinary, SbxBinaryLocator } from './SbxBinaryLocator';
import type {
	NetworkPolicySummary,
	SbxDiagnoseReport,
	SbxIntrospection,
	SbxVersionInfo,
	SettingValue,
} from './SbxIntrospection';
import { SbxOutputParser } from './SbxOutputParser';
import { SbxProcess, type SbxProcessResult } from './SbxProcess';
import { SbxStartNoticeFilter } from './SbxStartNoticeFilter';
import { WorkerCredentialFilter } from './WorkerCredentialFilter';

export interface SbxCliRuntimeOptions {
	/** Executable path. Default: SBX_MOCK_PATH, SBX_PATH, the Windows install directory, then PATH. */
	binaryPath?: string;
	/** Environment of the sbx child. Default: process.env. */
	env?: NodeJS.ProcessEnv;
	platform?: NodeJS.Platform;
	/** Where private env files are created. Default: os.tmpdir(). */
	tempDirectory?: string;
	/** Time limit of every command except create. Default 120 s. */
	commandTimeoutMs?: number;
	/** Time limit of create (a cold image pull takes minutes). Default 10 min. */
	createTimeoutMs?: number;
	/** Time limit of exec. Default: none (a step decides), pass an AbortSignal to stop it. */
	execTimeoutMs?: number;
}

const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_CREATE_TIMEOUT_MS = 600_000;
/** `sbx exec` on a missing sandbox exits 125 (sbx 0.51.0, fixture err-exec-missing); the other verbs exit 1. */
const EXEC_SANDBOX_NOT_FOUND_EXIT_CODE = 125;
/** Largest timer value Node accepts; stands for "no limit". */
const NO_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * The only class that builds `sbx` command lines.
 *
 * Rules enforced here for every call:
 * - `shell: false` and argument arrays (SbxProcess), hidden window, `MSYS_NO_PATHCONV=1` in the child
 *   environment (Git Bash would otherwise rewrite `-w /c/dir` into `C:/dir`).
 * - `--cpus` and `-m` are always passed to `create` (sbx defaults to 20 CPUs and half of the RAM).
 * - Policy rules and secrets always carry `--sandbox`; no method can add a machine-wide rule.
 * - Environment values go through a private `--env-file`, secrets are read by sbx from a command: neither
 *   appears on a command line.
 * - The sbx version must equal PINNED_SBX_VERSION, checked once per instance before the first command.
 */
export class SbxCliRuntime implements SandboxRuntime, SbxIntrospection {
	private readonly env: NodeJS.ProcessEnv;
	private readonly platform: NodeJS.Platform;
	private readonly tempDirectory: string;
	private readonly commandTimeoutMs: number;
	private readonly createTimeoutMs: number;
	private readonly execTimeoutMs: number;
	private readonly paths: HostPathFormatter;
	private readonly parser = new SbxOutputParser();
	private readonly validator = new SandboxRequestValidator();
	private readonly process = new SbxProcess();
	private binary: SbxBinary | undefined;
	private verified: Promise<void> | undefined;

	constructor(private readonly options: SbxCliRuntimeOptions = {}) {
		this.platform = options.platform ?? process.platform;
		this.env = { ...WorkerCredentialFilter.apply(options.env ?? process.env), MSYS_NO_PATHCONV: '1' };
		this.tempDirectory = options.tempDirectory ?? os.tmpdir();
		this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
		this.createTimeoutMs = options.createTimeoutMs ?? DEFAULT_CREATE_TIMEOUT_MS;
		this.execTimeoutMs = options.execTimeoutMs ?? NO_TIMEOUT_MS;
		this.paths = new HostPathFormatter(this.platform);
	}

	// ---- SandboxRuntime ----

	async create(request: CreateSandboxRequest): Promise<void> {
		this.validator.create(request);
		const args = [
			'create',
			'--name',
			request.name,
			'--cpus',
			String(request.cpus),
			'-m',
			request.memory.toLowerCase(),
		];
		if (request.image !== undefined) args.push('-t', request.image);
		if (request.pull !== undefined) args.push('--pull', request.pull);
		args.push(request.agent);
		for (const mount of request.mounts) {
			const native = this.paths.toNative(mount.hostPath, 'Mount path');
			args.push(mount.readOnly === true ? `${native}:ro` : native);
		}
		await this.runChecked(args, this.createTimeoutMs, request.name);
		await this.absorbFirstBashBanner(request.name);
	}

	/**
	 * The default sbx templates print a banner on the stdout of the FIRST bash of a sandbox (/etc/bash.bashrc sources
	 * /etc/profile.d/01-dhi.sh, which then leaves a marker; fixture exec-first-after-create). Nothing turns it off: no flag,
	 * setting or variable (NO_COLOR only removes the colors). Whatever runs first would find it in its output, a model
	 * tool included, so a bash that prints nothing runs here, once, and its output is discarded. Images that print no banner
	 * pay one exec. A sandbox without bash cannot run anything this package starts, so it is reported now.
	 */
	private async absorbFirstBashBanner(sandbox: string): Promise<void> {
		const result = await this.exec({ sandbox, command: ['bash', '-c', 'true'] });
		if (result.exitCode !== 0) {
			throw new SandboxError(
				'command-failed',
				`Sandbox "${sandbox}" was created, but "bash -c true" failed in it (exit ${result.exitCode}: ${result.stderr.trim() || result.stdout.trim() || 'no output'}). ` +
					`flow-sandbox needs bash in the image; use an image that has it. The sandbox still exists: remove it with "sbx rm --force ${sandbox}".`,
				{ sandbox, exitCode: result.exitCode, stderr: result.stderr }
			);
		}
	}

	async exec(request: ExecRequest): Promise<ExecResult> {
		this.validator.exec(request);
		await this.ensureVerified();

		const envFile =
			request.env !== undefined && Object.keys(request.env).length > 0
				? PrivateEnvFile.create(this.tempDirectory, request.env)
				: undefined;
		try {
			const args = ['exec'];
			if (request.stdin !== undefined) args.push('-i');
			if (envFile !== undefined) args.push('--env-file', this.paths.toNative(envFile.filePath, 'Env file path'));
			if (request.cwd !== undefined) args.push('-w', request.cwd);
			args.push(request.sandbox, '--', ...request.command);

			// `sbx exec` announces on stderr that it started a stopped sandbox (fixture exec-after-stop): not the command's output.
			const startNotice =
				request.onStderr === undefined
					? undefined
					: new SbxStartNoticeFilter(request.sandbox, request.onStderr);
			const raw = await this.process
				.run({
					binary: this.requireBinary(),
					args,
					env: this.env,
					stdin: request.stdin,
					onStdout: request.onStdout,
					onStderr: startNotice === undefined ? undefined : text => startNotice.push(text),
					signal: request.signal,
					timeoutMs: this.execTimeoutMs,
				})
				.finally(() => startNotice?.finish());
			const result = { ...raw, stderr: SbxStartNoticeFilter.strip(request.sandbox, raw.stderr) };
			// A program inside the sandbox can print the same text and exit 1: only the sandbox list can tell.
			if (
				this.isSandboxNotFound(result, request.sandbox, EXEC_SANDBOX_NOT_FOUND_EXIT_CODE) &&
				!(await this.exists(request.sandbox))
			) {
				throw this.notFound(request.sandbox, args, result);
			}
			return result;
		} finally {
			envFile?.dispose();
		}
	}

	async stop(name: string): Promise<void> {
		this.validator.name(name);
		await this.runChecked(['stop', name], this.commandTimeoutMs, name);
	}

	/** sbx has no `start` verb: `exec` starts a stopped sandbox, so a trivial command does it. */
	async start(name: string): Promise<void> {
		const result = await this.exec({ sandbox: name, command: ['true'] });
		if (result.exitCode !== 0) {
			throw new SandboxError(
				'command-failed',
				`Starting sandbox "${name}" failed: the probe command exited with ${result.exitCode}. stderr: ${result.stderr.trim()}`,
				{ sandbox: name, exitCode: result.exitCode, stderr: result.stderr }
			);
		}
	}

	async remove(name: string): Promise<void> {
		this.validator.name(name);
		// --force: without it sbx asks for confirmation, which cannot be answered without a terminal.
		await this.runChecked(['rm', '--force', name], this.commandTimeoutMs, name);
	}

	async list(): Promise<SandboxInfo[]> {
		const result = await this.runChecked(['ls', '--json'], this.commandTimeoutMs);
		return this.parser.parseList(result.stdout);
	}

	async copyIn(request: CopyInRequest): Promise<void> {
		this.validator.name(request.sandbox);
		const sandboxPath = this.validator.sandboxPath(request.sandboxPath);
		const host = this.paths.toNative(request.hostPath, 'Copy source path');
		await this.runChecked(
			['cp', host, `${request.sandbox}:${sandboxPath}`],
			this.commandTimeoutMs,
			request.sandbox
		);
	}

	async copyOut(request: CopyOutRequest): Promise<void> {
		this.validator.name(request.sandbox);
		const sandboxPath = this.validator.sandboxPath(request.sandboxPath);
		const host = this.paths.toNative(request.hostPath, 'Copy destination path');
		await this.runChecked(
			['cp', `${request.sandbox}:${sandboxPath}`, host],
			this.commandTimeoutMs,
			request.sandbox
		);
	}

	async allowNetwork(request: NetworkRuleRequest): Promise<void> {
		this.validator.name(request.sandbox);
		const resources = this.validator.resources(request.resources).join(',');
		await this.runChecked(
			['policy', 'allow', 'network', '--sandbox', request.sandbox, resources],
			this.commandTimeoutMs,
			request.sandbox
		);
	}

	async removeNetwork(request: NetworkRuleRequest): Promise<void> {
		this.validator.name(request.sandbox);
		const resources = this.validator.resources(request.resources).join(',');
		// --force: without it a non-interactive call is refused.
		try {
			await this.runChecked(
				['policy', 'rm', 'network', '--sandbox', request.sandbox, '--resource', resources, '--force'],
				this.commandTimeoutMs,
				request.sandbox
			);
		} catch (error) {
			// For a sandbox that is gone sbx does not say "sandbox not found" but "no scoped policy found for sandbox", or, when
			// another sandbox holds a rule for the same resource, "... is covered by rule ... in sandbox ..., not in sandbox ..."
			// (both observed, 0.49.2). The same texts can also mean "no such rule", so existence decides.
			if (
				error instanceof SandboxError &&
				error.kind === 'command-failed' &&
				/no scoped policy found for sandbox|is covered by rule .* not in sandbox/.test(error.stderr ?? '') &&
				!(await this.exists(request.sandbox))
			) {
				throw new SandboxError(
					'not-found',
					`Sandbox "${request.sandbox}" does not exist (sbx: ${error.stderr?.split('\n')[0]?.trim()}). It may have been removed or never created; list sandboxes with "sbx ls".`,
					{
						sandbox: request.sandbox,
						argv: error.argv,
						exitCode: error.exitCode,
						stderr: error.stderr,
						cause: error,
					}
				);
			}
			throw error;
		}
	}

	async setSecret(request: SecretRequest): Promise<void> {
		this.validator.secret(request);
		const args = ['secret', 'set-custom', '--sandbox', request.sandbox];
		for (const host of request.hosts) args.push('--host', host);
		args.push('--env', request.envVar, '--placeholder', request.placeholder, '--command', request.valueCommand);
		await this.runChecked(args, this.commandTimeoutMs, request.sandbox);
	}

	async setServiceSecret(request: ServiceSecretRequest): Promise<void> {
		this.validator.serviceSecret(request);
		// sbx 0.49.2 stores a secret scoped to a sandbox that does not exist (observed) and the next sandbox of that
		// name would inherit it, so existence is checked here.
		if (!(await this.exists(request.sandbox))) {
			throw new SandboxError(
				'not-found',
				`Sandbox "${request.sandbox}" does not exist, so no secret was stored for it (sbx itself would have accepted the name and kept the secret for a later sandbox of that name). Create the sandbox first.`,
				{ sandbox: request.sandbox }
			);
		}
		// The key goes through standard input (documented non-interactive form), never through the arguments.
		await this.runChecked(
			['secret', 'set', request.service, '--sandbox', request.sandbox],
			this.commandTimeoutMs,
			request.sandbox,
			`${request.value}\n`
		);
	}

	async removeSecret(request: SecretRemoveRequest): Promise<void> {
		this.validator.name(request.sandbox);
		this.validator.placeholder(request.placeholder);
		await this.runChecked(
			['secret', 'rm', '--sandbox', request.sandbox, '--placeholder', request.placeholder, '--force'],
			this.commandTimeoutMs,
			request.sandbox
		);
	}

	// ---- SbxIntrospection ----

	async readVersion(): Promise<SbxVersionInfo> {
		const binary = this.requireBinary();
		const result = await this.runUnverified(['version']);
		this.throwIfFailed(['version'], result);
		const parsed = this.parser.parseVersion(result.stdout);
		return { ...parsed, binaryPath: binary.displayPath };
	}

	async readDiagnose(): Promise<SbxDiagnoseReport> {
		const result = await this.runChecked(['diagnose', '--json'], this.commandTimeoutMs);
		return this.parser.parseDiagnose(result.stdout);
	}

	async readNetworkPolicy(): Promise<NetworkPolicySummary> {
		const result = await this.runChecked(['policy', 'ls', '--json'], this.commandTimeoutMs);
		return this.parser.parseNetworkPolicy(result.stdout);
	}

	async readSetting(key: string): Promise<SettingValue | undefined> {
		const result = await this.runChecked(['settings', 'ls', '--json'], this.commandTimeoutMs);
		return this.parser.parseSettings(result.stdout).get(key);
	}

	// ---- internals ----

	private requireBinary(): SbxBinary {
		this.binary ??= new SbxBinaryLocator({
			binaryPath: this.options.binaryPath,
			env: this.env,
			platform: this.platform,
			nodeExecutable: process.execPath,
		}).locate();
		return this.binary;
	}

	/** Checks the pinned version once; a failure is not cached so a fixed installation is picked up. */
	private ensureVerified(): Promise<void> {
		this.verified ??= this.verifyVersion().catch((error: unknown) => {
			this.verified = undefined;
			throw error;
		});
		return this.verified;
	}

	private async verifyVersion(): Promise<void> {
		const found = await this.readVersion();
		if (found.version !== PINNED_SBX_VERSION) {
			throw new SandboxError(
				'version-mismatch',
				`sbx ${found.version} found at ${found.binaryPath}, but flow-sandbox is pinned to sbx ${PINNED_SBX_VERSION}. ` +
					`Install v${PINNED_SBX_VERSION} (${sbxReleaseUrl(PINNED_SBX_VERSION)}) or point SBX_PATH / the "binaryPath" option to it. ` +
					'To adopt the newer sbx instead, refresh the fixtures (scripts/CaptureSbxFixtures.mjs), run the live check ' +
					'(scripts/live/SbxLiveCheck.mjs) and update PINNED_SBX_VERSION in src/PinnedSbxVersion.ts.'
			);
		}
	}

	private async runUnverified(args: readonly string[]): Promise<SbxProcessResult> {
		return this.process.run({
			binary: this.requireBinary(),
			args,
			env: this.env,
			timeoutMs: this.commandTimeoutMs,
		});
	}

	private async runChecked(
		args: readonly string[],
		timeoutMs: number,
		sandbox?: string,
		stdin?: string
	): Promise<SbxProcessResult> {
		await this.ensureVerified();
		const result = await this.process.run({ binary: this.requireBinary(), args, env: this.env, timeoutMs, stdin });
		this.throwIfFailed(args, result, sandbox);
		return result;
	}

	private throwIfFailed(args: readonly string[], result: SbxProcessResult, sandbox?: string): void {
		if (result.exitCode === 0) return;
		const stderr = result.stderr.trim();
		// These commands are sbx's own, never a program inside the sandbox, so its error text is trustworthy.
		if (sandbox !== undefined && this.isSandboxNotFound(result, sandbox)) {
			throw this.notFound(sandbox, args, result);
		}
		if (/already exists/i.test(stderr)) {
			throw new SandboxError(
				'already-exists',
				`sbx ${args.slice(0, 2).join(' ')} failed: ${stderr}. Choose another name or remove the existing sandbox first.`,
				{ sandbox, argv: args, exitCode: result.exitCode, stderr }
			);
		}
		throw new SandboxError(
			'command-failed',
			`sbx ${args.slice(0, 3).join(' ')} failed with exit code ${result.exitCode}: ${stderr === '' ? '(no error output)' : stderr}`,
			{ sandbox, argv: args, exitCode: result.exitCode, stderr }
		);
	}

	private async exists(sandbox: string): Promise<boolean> {
		return (await this.list()).some(info => info.name === sandbox);
	}

	private isSandboxNotFound(result: SbxProcessResult, sandbox: string, exitCode = 1): boolean {
		// Only sbx's own failure counts: the command inside the sandbox can print anything and exit 1.
		return (
			result.exitCode === exitCode &&
			result.stdout === '' &&
			result.stderr.startsWith(`error: sandbox '${sandbox}' not found`)
		);
	}

	private notFound(sandbox: string, args: readonly string[], result: SbxProcessResult): SandboxError {
		return new SandboxError(
			'not-found',
			`Sandbox "${sandbox}" does not exist (sbx: ${result.stderr.split('\n')[0]?.trim()}). It may have been removed or never created; list sandboxes with "sbx ls".`,
			{ sandbox, argv: args, exitCode: result.exitCode, stderr: result.stderr }
		);
	}
}
