/**
 * Names a host script (`host: true`) needs to start at all on the wrapper's machine: where programs are found, the
 * system and temp directories, the user directories, the locale and the Git Bash location. Everything else of the
 * wrapper's environment is secret until proven otherwise. Compared case-insensitively (`Path` and `PATH` are one
 * variable on Windows).
 */
const BASELINE_NAMES = new Set(
	[
		'PATH',
		'PATHEXT',
		'SYSTEMROOT',
		'SYSTEMDRIVE',
		'WINDIR',
		'COMSPEC',
		'TEMP',
		'TMP',
		'TMPDIR',
		'HOME',
		'HOMEDRIVE',
		'HOMEPATH',
		'USERPROFILE',
		'APPDATA',
		'LOCALAPPDATA',
		'PROGRAMFILES',
		'PROGRAMFILES(X86)',
		'PROGRAMW6432',
		'PROGRAMDATA',
		'COMMONPROGRAMFILES',
		'USERNAME',
		'USER',
		'LOGNAME',
		'OS',
		'NUMBER_OF_PROCESSORS',
		'PROCESSOR_ARCHITECTURE',
		'LANG',
		'TZ',
		'TERM',
		'FLOW_BASH_PATH',
		'MSYSTEM',
		'MSYS',
		'MSYS2_PATH_TYPE',
	].map(name => name.toUpperCase())
);

/** Prefixes of the baseline (`LC_ALL`, `LC_CTYPE`, ...). */
const BASELINE_PREFIXES = ['LC_'];

/**
 * Names that carry the wrapper's own secrets or plumbing. They never reach a host script from the wrapper's environment,
 * even when a future change adds them to the baseline; only a step that DECLARES the name (its own `env` or `secrets`)
 * gets the value the step gave it.
 */
const WRAPPER_ONLY_PREFIXES = ['FLOW_SANDBOX_HOST_', 'FLOW_WORKER_', 'AWS_', 'AMAZON_', 'AZURE_', 'GOOGLE_', 'GCP_'];

export interface HostScriptFilteredEnvironment {
	env: Record<string, string>;
	/** Names of the wrapper's environment that were not handed on (names only, never values). */
	droppedNames: string[];
}

/**
 * The environment of a script step that runs on the wrapper's machine (`host: true`). Pure.
 *
 * Unlike the VM, the host script runs with the rights of the user and next to the wrapper's secrets: the launch token,
 * the AWS profile of the credential endpoint, the real home directories the daemon was isolated from
 * (`FLOW_SANDBOX_HOST_*`). The engine hands a script step the WHOLE environment of the worker process, so the filter is an
 * allow-list: the baseline above, plus the names the step declares. A declared name always wins over the baseline and the
 * wrapper-only prefixes, with the value the engine computed for it (the step's own).
 */
export class HostScriptEnvironment {
	filter(
		environment: Readonly<Record<string, string | undefined>> | undefined,
		declared: ReadonlySet<string> = new Set()
	): HostScriptFilteredEnvironment {
		const declaredUpper = new Set([...declared].map(name => name.toUpperCase()));
		const result: HostScriptFilteredEnvironment = { env: {}, droppedNames: [] };
		for (const [name, value] of Object.entries(environment ?? {})) {
			if (value === undefined) continue;
			const key = name.toUpperCase();
			if (declaredUpper.has(key) || this.isBaseline(key)) {
				result.env[name] = value;
			} else {
				result.droppedNames.push(name);
			}
		}
		return result;
	}

	/** One summary line for the log, or undefined when nothing was dropped. */
	describe(filtered: HostScriptFilteredEnvironment): string | undefined {
		if (filtered.droppedNames.length === 0) return undefined;
		const names = [...filtered.droppedNames].sort();
		return `${names.length} variable(s) of the wrapper environment were not handed to the host script (${names.slice(0, 12).join(',')}${names.length > 12 ? ',...' : ''}); declare a name in the step's env to pass it.`;
	}

	private isBaseline(upperName: string): boolean {
		if (WRAPPER_ONLY_PREFIXES.some(prefix => upperName.startsWith(prefix))) return false;
		return BASELINE_NAMES.has(upperName) || BASELINE_PREFIXES.some(prefix => upperName.startsWith(prefix));
	}
}
