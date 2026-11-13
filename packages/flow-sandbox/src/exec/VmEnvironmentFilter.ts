import type { SandboxLog } from '../SandboxLog';
import { basenameBySyntax } from './HostPaths';

/**
 * Variables that describe the HOST machine: the engine copies them from its own environment into every step
 * process (`PATH`, `HOME`, `TMPDIR`, ... in ScriptExecutor and ClaudeLauncher). Inside the VM they are wrong
 * (Windows paths, a Git Bash PATH), so they are never forwarded: the VM keeps its own values. Names are compared
 * case-insensitively (`Path` and `PATH` are the same variable on Windows).
 */
const HOST_ONLY_NAMES = new Set(
	[
		'PATH',
		'PATHEXT',
		'HOME',
		'USERPROFILE',
		'HOMEDRIVE',
		'HOMEPATH',
		'TMPDIR',
		'TEMP',
		'TMP',
		'SYSTEMROOT',
		'WINDIR',
		'COMSPEC',
		'APPDATA',
		'LOCALAPPDATA',
		'PROGRAMFILES',
		'PROGRAMFILES(X86)',
		'PROGRAMDATA',
		'FLOW_BASH_PATH',
		'MSYSTEM',
		'MSYS',
		'MSYS2_PATH_TYPE',
	].map(name => name.toUpperCase())
);

export interface FilteredEnvironment {
	env: Record<string, string>;
	/** Names dropped because they describe the host. */
	droppedHostOnly: string[];
	/** Names dropped because the engine copied them from the host's own environment (same name and value, not declared by the step). */
	droppedAmbient: string[];
	/** Names kept whose value looks like a Windows path (not translated, see PathTranslator). */
	windowsPathNames: string[];
}

/**
 * `XDG_CONFIG_HOME` that the engine points at a throw-away directory it makes in the HOST temp directory for each opencode process
 * (`opencode-run-<uuid>`, holding a copy of the user's global opencode config): it does not exist in the VM and is not forwarded.
 */
const ENGINE_ISOLATED_CONFIG_DIRECTORY = /^opencode-run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WINDOWS_PATH = /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/;

/**
 * Environment of a step process, turned into the one the VM may receive. Pure.
 *
 * The engine does NOT isolate the environment of a script step (`isolateEnv: false` in ScriptStepExecutor): the whole
 * environment of the worker process is handed to it, and ClaudeLauncher copies `ANTHROPIC_API_KEY` from it. Forwarded as
 * is, every secret in the environment of the wrapper (launch token, profile names, whatever the daemon had) would land
 * in the VM. So a variable is forwarded only when it is NOT an ambient copy: the step declared it (its `env`, its
 * `secrets`, the wrapper's model environment: the `declared` set) or its value differs from the host's own. A variable
 * with the host's name AND value that the step did not declare is dropped. Limit: a variable the engine derives itself
 * (for example the context-limit settings) passes because it is not in the host environment.
 */
export class VmEnvironmentFilter {
	private readonly host: ReadonlyMap<string, string>;

	constructor(hostEnvironment: NodeJS.ProcessEnv) {
		this.host = new Map(
			Object.entries(hostEnvironment)
				.filter((entry): entry is [string, string] => entry[1] !== undefined)
				.map(([name, value]) => [name.toUpperCase(), value])
		);
	}

	filter(
		environment: Readonly<Record<string, string | undefined>> | undefined,
		declared: ReadonlySet<string> = new Set()
	): FilteredEnvironment {
		const declaredUpper = new Set([...declared].map(name => name.toUpperCase()));
		const result: FilteredEnvironment = {
			env: {},
			droppedHostOnly: [],
			droppedAmbient: [],
			windowsPathNames: [],
		};
		for (const [name, value] of Object.entries(environment ?? {})) {
			if (value === undefined) continue;
			const key = name.toUpperCase();
			if (HOST_ONLY_NAMES.has(key)) {
				result.droppedHostOnly.push(name);
				continue;
			}
			if (key === 'XDG_CONFIG_HOME' && ENGINE_ISOLATED_CONFIG_DIRECTORY.test(basenameBySyntax(value))) {
				result.droppedHostOnly.push(name);
				continue;
			}
			if (!declaredUpper.has(key) && this.host.get(key) === value) {
				result.droppedAmbient.push(name);
				continue;
			}
			if (WINDOWS_PATH.test(value)) result.windowsPathNames.push(name);
			result.env[name] = value;
		}
		return result;
	}

	/** One summary line for the log (names only, never values), or undefined when nothing was dropped or flagged. */
	describe(filtered: FilteredEnvironment): string | undefined {
		const parts: string[] = [];
		if (filtered.droppedHostOnly.length > 0) {
			parts.push(`host-only variables not forwarded: ${filtered.droppedHostOnly.sort().join(',')}`);
		}
		if (filtered.droppedAmbient.length > 0) {
			const names = filtered.droppedAmbient.sort();
			parts.push(
				`${names.length} variable(s) copied from the host environment and not declared by the step were not forwarded (${names.slice(0, 12).join(',')}${names.length > 12 ? ',...' : ''})`
			);
		}
		if (filtered.windowsPathNames.length > 0) {
			parts.push(
				`values that look like Windows paths were forwarded unchanged (they do not exist in the VM): ${filtered.windowsPathNames.sort().join(',')}`
			);
		}
		return parts.length === 0 ? undefined : parts.join('; ');
	}

	report(filtered: FilteredEnvironment, log: SandboxLog, context: string): void {
		const line = this.describe(filtered);
		if (line === undefined) return;
		if (filtered.windowsPathNames.length > 0) log.warn(`${context}: ${line}`);
		else log.info(`${context}: ${line}`);
	}
}
