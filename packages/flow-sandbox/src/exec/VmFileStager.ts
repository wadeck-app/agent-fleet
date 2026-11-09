import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import type { SandboxRuntime } from '../SandboxRuntime';
import { McpConfigRewriter } from './McpConfigRewriter';

export type StagedFileKind = 'script' | 'mcp-config' | 'settings';

export interface StagedFile {
	/** Path of the copy inside the VM. */
	vmPath: string;
	kind: StagedFileKind;
	/** Host port of the engine's MCP callback server, for an `mcp-config` (the sandbox needs a network rule for it). */
	mcpCallbackPort?: number;
}

export interface VmFileStagerOptions {
	runtime: SandboxRuntime;
	log: SandboxLog;
	/** The host temp directory the engine writes its files to (`os.tmpdir()`). */
	hostTempDirectory: string;
	hostNodePath: string;
	platform: NodeJS.Platform;
	/** Directory in the VM. Default `/tmp/flow-staged`. */
	vmDirectory?: string;
}

/** The only host files the engine hands to a step process: name prefix -> kind. */
const KNOWN_PREFIXES: ReadonlyArray<{ prefix: string; kind: StagedFileKind; extensions: readonly string[] }> = [
	{ prefix: 'agent-fleet-script-', kind: 'script', extensions: ['.sh'] },
	{ prefix: 'mcp-config-', kind: 'mcp-config', extensions: ['.json'] },
	{ prefix: 'claude-settings-', kind: 'settings', extensions: ['.json'] },
];

const MAX_STAGED_BYTES = 8 * 1024 * 1024;

/**
 * Model providers and the script executor write their files (script text, MCP config, Claude settings) to the HOST
 * temp directory and pass the path on the command line. The VM cannot see it, so each file is copied into the VM
 * (`/tmp/flow-staged`, mode 0600, through `exec` and stdin: the host never writes into a directory the agent controls)
 * and the argument is replaced.
 *
 * Only files with the names the engine generates (see KNOWN_PREFIXES), directly in the host temp directory, regular
 * files and not links, are staged. Any other host file is refused: a step argument must not be a way to copy an
 * arbitrary host file into the VM.
 *
 * Limits: removing the copies is the caller's job (StepCommandTranslator wraps the command so the same `exec` deletes them
 * when the process ends; if the VM is stopped to end the process they stay until the sandbox is removed). `codex` and
 * `opencode` write other temp files (hooks, run directories): refused here, so those tools are not supported by the exec
 * variant yet.
 */
export class VmFileStager {
	private readonly rewriter: McpConfigRewriter;
	private readonly directory: string;

	constructor(private readonly options: VmFileStagerOptions) {
		this.rewriter = new McpConfigRewriter(options.hostNodePath, options.platform);
		this.directory = options.vmDirectory ?? '/tmp/flow-staged';
	}

	/** True when the argument is a host path that must be staged rather than translated. */
	isStageable(hostPath: string): boolean {
		return this.classify(hostPath) !== undefined;
	}

	async stage(sandbox: string, hostPath: string): Promise<StagedFile> {
		const kind = this.classify(hostPath);
		if (kind === undefined) {
			throw new SandboxError(
				'path-outside-mounts',
				`The host file "${hostPath}" is not one of the files the engine generates for a step (${KNOWN_PREFIXES.map(known => `${known.prefix}*`).join(', ')} in ${this.options.hostTempDirectory}), so it is not copied into the sandbox. Codex and OpenCode steps are not supported by the exec variant yet.`
			);
		}
		const content = this.readRegularFile(hostPath);
		let text = content.toString('utf8');
		let mcpCallbackPort: number | undefined;
		if (kind === 'mcp-config') {
			const rewritten = this.rewriter.rewrite(text, path.basename(hostPath));
			text = rewritten.json;
			mcpCallbackPort = rewritten.callbackPort;
		} else if (kind === 'settings' && /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/.test(text)) {
			this.options.log.warn(
				`${path.basename(hostPath)}: the Claude settings (hooks) mention a Windows path; hook commands run in the VM, where that path does not exist.`
			);
		}
		const vmPath = `${this.directory}/${randomBytes(8).toString('hex')}-${path.basename(hostPath)}`;
		const result = await this.options.runtime.exec({
			sandbox,
			// Paths are positional arguments, never spliced into the script text.
			command: ['bash', '-c', 'set -e; umask 077; mkdir -p "$(dirname "$1")"; cat > "$1"', 'flow-stage', vmPath],
			stdin: text,
		});
		if (result.exitCode !== 0) {
			throw new SandboxError(
				'command-failed',
				`Copying ${path.basename(hostPath)} into sandbox "${sandbox}" failed with exit code ${result.exitCode}: ${result.stderr.trim() || '(no error output)'}. Check that /tmp is writable in the image.`,
				{ sandbox, exitCode: result.exitCode, stderr: result.stderr }
			);
		}
		return { vmPath, kind, ...(mcpCallbackPort === undefined ? {} : { mcpCallbackPort }) };
	}

	private classify(hostPath: string): StagedFileKind | undefined {
		const flavor = this.options.platform === 'win32' ? path.win32 : path.posix;
		const name = flavor.basename(hostPath);
		const known = KNOWN_PREFIXES.find(
			candidate => name.startsWith(candidate.prefix) && candidate.extensions.includes(flavor.extname(name))
		);
		if (known === undefined) return undefined;
		const parent = this.canonical(flavor.dirname(hostPath));
		const expected = this.canonical(this.options.hostTempDirectory);
		return parent !== undefined && parent === expected ? known.kind : undefined;
	}

	private canonical(directory: string): string | undefined {
		try {
			const real = fs.realpathSync.native(directory);
			return this.options.platform === 'win32' ? real.toLowerCase() : real;
		} catch {
			return undefined;
		}
	}

	private readRegularFile(hostPath: string): Buffer {
		const stats = fs.lstatSync(hostPath);
		if (!stats.isFile()) {
			throw new SandboxError(
				'path-outside-mounts',
				`The host file "${hostPath}" is a link or not a regular file: it is not copied into the sandbox.`
			);
		}
		if (stats.size > MAX_STAGED_BYTES) {
			throw new SandboxError(
				'invalid-argument',
				`The host file "${hostPath}" is ${stats.size} bytes, above the ${MAX_STAGED_BYTES}-byte limit for files copied into the sandbox.`
			);
		}
		return fs.readFileSync(hostPath);
	}
}
