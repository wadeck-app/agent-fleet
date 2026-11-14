/**
 * Names a host tool needs to start at all: where programs are found, system and temp directories, user directories, the
 * locale. Everything else of the worker's environment is secret until a tool declares its NAME. Compared
 * case-insensitively (`Path` and `PATH` are one variable on Windows).
 *
 * Kept next to the host tools on purpose: the equivalent of flow-sandbox `HostScriptEnvironment` is not importable from
 * here, and the two lists answer different questions (a script step versus a closed argv). Keep them in step by hand
 * until a shared home exists.
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
	].map(name => name.toUpperCase())
);

const BASELINE_PREFIXES = ['LC_'];

/**
 * Defence in depth: validation already refuses `FLOW_WORKER_*` and `FLOW_MCP_*` in a tool's `env`, but a definition that
 * skipped validation must still never carry the worker's credentials or the per-step bearers to a child.
 */
const DENIED_PREFIXES = ['FLOW_WORKER_', 'FLOW_MCP_', 'FLOW_SANDBOX_HOST_'];
const DENIED_NAMES = new Set(['FLOW_EXECUTION_ID']);

export interface HostToolChildEnvironment {
	env: Record<string, string>;
	/** Declared names that are never handed over (names only, never values). */
	denied: string[];
	/** Declared names the worker environment does not have. */
	missing: string[];
}

/** The environment of one host tool process: the baseline, plus the NAMES the tool declares, read from the worker. */
export class HostToolEnvironment {
	static build(
		workerEnvironment: Readonly<Record<string, string | undefined>>,
		declaredNames: readonly string[]
	): HostToolChildEnvironment {
		const result: HostToolChildEnvironment = { env: {}, denied: [], missing: [] };
		const declared = new Map<string, string>();
		for (const name of declaredNames) {
			if (HostToolEnvironment.isDenied(name)) {
				result.denied.push(name);
			} else {
				declared.set(name.toUpperCase(), name);
			}
		}
		const found = new Set<string>();
		for (const [name, value] of Object.entries(workerEnvironment)) {
			if (value === undefined) continue;
			const key = name.toUpperCase();
			if (HostToolEnvironment.isDenied(name)) continue;
			if (declared.has(key)) found.add(key);
			if (declared.has(key) || HostToolEnvironment.isBaseline(key)) result.env[name] = value;
		}
		for (const [key, name] of declared) {
			if (!found.has(key)) result.missing.push(name);
		}
		return result;
	}

	static isDenied(name: string): boolean {
		const key = name.toUpperCase();
		return DENIED_NAMES.has(key) || DENIED_PREFIXES.some(prefix => key.startsWith(prefix));
	}

	private static isBaseline(upperName: string): boolean {
		return BASELINE_NAMES.has(upperName) || BASELINE_PREFIXES.some(prefix => upperName.startsWith(prefix));
	}
}
