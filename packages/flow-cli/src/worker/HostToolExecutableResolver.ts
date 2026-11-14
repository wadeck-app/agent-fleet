import type { HostTool } from 'flow-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { HostToolAuditLog } from './HostToolAuditLog';

/** An executable could not be resolved, or is not the one recorded at run start. The message names step, tool and fix. */
export class HostToolExecutableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'HostToolExecutableError';
	}
}

/** The executable of a tool as found at run start: absolute path plus the identity re-checked before every launch (F-16). */
export interface ResolvedHostExecutable {
	toolId: string;
	/** `command[0]` as the author wrote it. */
	command: string;
	absolutePath: string;
	size: number;
	mtimeMs: number;
}

export interface HostToolExecutableResolverOptions {
	/** Defaults to the real platform; tests inject another to exercise the Windows rules everywhere. */
	platform?: NodeJS.Platform;
	/** Where `PATH` and `PATHEXT` are read. The worker's own environment. */
	environment: Readonly<Record<string, string | undefined>>;
}

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';
const MAX_ENTRY_LENGTH = 64;
const SHELL_SCRIPT_EXTENSIONS = new Set(['.cmd', '.bat']);

/**
 * Resolves `command[0]` of a host tool to an absolute path ONCE, records its identity (size, mtime) and re-verifies it
 * right before each spawn: a path or identity that changed is refused with a named error. The spawn then uses the
 * absolute path, never the name. A same-user process can still swap the file between the re-check and `exec`; that is
 * the residual of F-16 (same user, no new authority).
 *
 * Slice 1 rules: a relative path (`./x`, `bin/x`) is refused; an absolute path is used as given; a bare name is searched
 * in the ABSOLUTE entries of PATH (with PATHEXT on Windows); relative and empty entries are ignored (see
 * `ignoredPathEntries`), and a command found only through one is refused. On Windows `.cmd`/`.bat` are refused: cmd.exe would re-parse the arguments.
 */
export class HostToolExecutableResolver {
	private readonly platform: NodeJS.Platform;

	constructor(private readonly options: HostToolExecutableResolverOptions) {
		this.platform = options.platform ?? process.platform;
	}

	resolve(stepId: string, tool: HostTool): ResolvedHostExecutable {
		const label = `Step '${stepId}' tool '${tool.id}'`;
		const command = tool.command[0];
		if (command === undefined || command === '') {
			throw new HostToolExecutableError(
				`${label}: command has no executable. Fix: put the executable name first.`
			);
		}
		if (/[\\/]/.test(command)) {
			if (!path.isAbsolute(command)) {
				throw new HostToolExecutableError(
					`${label}: executable '${command}' is a relative path, which host tools do not accept yet. Fix: use an absolute path or a bare name found on PATH.`
				);
			}
			if (!this.isRunnable(command)) {
				throw new HostToolExecutableError(
					`${label}: executable '${command}' does not exist or is not executable. Fix: correct the path.`
				);
			}
			return this.accept(label, tool.id, command, command);
		}
		const { absolute: searched, relative: ignored } = this.searchPath();
		if (searched.length === 0 && ignored.length === 0) {
			throw new HostToolExecutableError(
				`${label}: executable '${command}' cannot be searched because PATH is not set for the worker. Fix: set PATH for the worker, or use an absolute path.`
			);
		}
		for (const directory of searched) {
			for (const name of this.candidateNames(command)) {
				const candidate = path.join(directory, name);
				if (this.isRunnable(candidate)) {
					return this.accept(label, tool.id, command, candidate);
				}
			}
		}
		// Never resolved through: only checked, so that the author is told why a command that exists is refused.
		for (const entry of ignored) {
			for (const name of this.candidateNames(command)) {
				if (this.isRunnable(path.join(entry, name))) {
					throw new HostToolExecutableError(
						`${label}: command '${command}' resolves only through relative PATH entry '${HostToolAuditLog.clean(entry, MAX_ENTRY_LENGTH)}'; use an absolute command (set command[0] to its absolute path) or add its directory to PATH as an absolute entry.`
					);
				}
			}
		}
		const ignoredNote =
			ignored.length === 0
				? ''
				: ` Ignored relative or empty PATH entries: ${HostToolExecutableResolver.describe(ignored)}.`;
		throw new HostToolExecutableError(
			`${label}: executable '${command}' was not found on PATH (searched: ${searched.join(path.delimiter)}).${ignoredNote} Fix: install it, put its directory on the worker's PATH as an absolute entry, or use an absolute path.`
		);
	}

	/** The relative and empty entries of the worker's PATH, in order: never searched. Empty for an absolute-only PATH. */
	ignoredPathEntries(): string[] {
		return this.searchPath().relative;
	}

	/** Entries as shown in a message: sanitised, length-capped, an empty one as `(empty)`. */
	static describe(entries: readonly string[]): string {
		return entries
			.map(entry => (entry === '' ? '(empty)' : `'${HostToolAuditLog.clean(entry, MAX_ENTRY_LENGTH)}'`))
			.join(', ');
	}

	/** Resolves every tool of a step; the first failure is thrown, naming that tool. */
	resolveAll(stepId: string, tools: readonly HostTool[]): Map<string, ResolvedHostExecutable> {
		const resolved = new Map<string, ResolvedHostExecutable>();
		for (const tool of tools) {
			resolved.set(tool.id, this.resolve(stepId, tool));
		}
		return resolved;
	}

	/** Refuses when the file at the recorded path is gone or is not the file that was recorded. */
	verify(stepId: string, executable: ResolvedHostExecutable): void {
		const label = `Step '${stepId}' tool '${executable.toolId}'`;
		let stat: fs.Stats;
		try {
			stat = fs.statSync(executable.absolutePath);
		} catch {
			throw new HostToolExecutableError(
				`${label}: executable '${executable.absolutePath}' changed since the run started: it no longer exists. Refused. Fix: restore it and start the run again.`
			);
		}
		if (!stat.isFile() || stat.size !== executable.size || stat.mtimeMs !== executable.mtimeMs) {
			throw new HostToolExecutableError(
				`${label}: executable '${executable.absolutePath}' changed since the run started (size ${executable.size} -> ${stat.size}, modified ${new Date(executable.mtimeMs).toISOString()} -> ${new Date(stat.mtimeMs).toISOString()}). Refused. Fix: if the update is intended, start the run again.`
			);
		}
	}

	private accept(label: string, toolId: string, command: string, absolutePath: string): ResolvedHostExecutable {
		if (!path.isAbsolute(absolutePath)) {
			throw new HostToolExecutableError(
				`${label}: resolved executable '${absolutePath}' is not an absolute path, which is refused (the spawn never uses a relative path). Fix: use absolute directories in the worker's PATH.`
			);
		}
		if (this.platform === 'win32' && SHELL_SCRIPT_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
			throw new HostToolExecutableError(
				`${label}: executable '${absolutePath}' is a ${path.extname(absolutePath)} file, which is refused: cmd.exe would re-parse the arguments. Fix: point command[0] to the real executable (.exe).`
			);
		}
		const stat = fs.statSync(absolutePath);
		return { toolId, command, absolutePath, size: stat.size, mtimeMs: stat.mtimeMs };
	}

	/**
	 * Splits PATH into absolute entries (searched) and relative or empty ones (never searched: they resolve against the
	 * worker's current directory, where the model may have planted a file).
	 */
	private searchPath(): { absolute: string[]; relative: string[] } {
		const entry = Object.entries(this.options.environment).find(([name]) => name.toUpperCase() === 'PATH');
		const value = entry?.[1] ?? '';
		if (value === '') {
			return { absolute: [], relative: [] };
		}
		const parts = value.split(path.delimiter);
		return {
			absolute: parts.filter(part => part !== '' && path.isAbsolute(part)),
			relative: parts.filter(part => part === '' || !path.isAbsolute(part)),
		};
	}

	private candidateNames(command: string): string[] {
		if (this.platform !== 'win32') {
			return [command];
		}
		const entry = Object.entries(this.options.environment).find(([name]) => name.toUpperCase() === 'PATHEXT');
		const extensions = (entry?.[1] ?? DEFAULT_PATHEXT).split(';').filter(part => part !== '');
		const own = path.extname(command).toLowerCase();
		if (own !== '' && extensions.some(extension => extension.toLowerCase() === own)) {
			return [command];
		}
		return extensions.map(extension => command + extension);
	}

	private isRunnable(candidate: string): boolean {
		try {
			if (!fs.statSync(candidate).isFile()) {
				return false;
			}
			if (this.platform !== 'win32') {
				fs.accessSync(candidate, fs.constants.X_OK);
			}
			return true;
		} catch {
			return false;
		}
	}
}
