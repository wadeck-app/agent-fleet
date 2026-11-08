/** Read-only views of the sbx installation, parsed from `--json` outputs. Implemented by SbxCliRuntime. */

export interface SbxVersionInfo {
	/** For example `0.51.0` (no leading `v`). */
	version: string;
	/** Build commit printed after the version, when present. */
	commit: string | undefined;
	/** The executable that answered. */
	binaryPath: string;
}

export interface SbxDiagnoseCheck {
	name: string;
	/** Raw sbx status: `pass`, `warn`, `skip` seen in 0.51.0; anything else is treated as a failure. */
	status: string;
	message: string;
	detail: string;
	hint: string;
}

export interface SbxDiagnoseReport {
	checks: readonly SbxDiagnoseCheck[];
}

/**
 * allow-all: some global network rule allows every host. deny-all: no global network allow rule.
 * restricted: an allow-list (the `balanced` preset or a custom list). Derived from `sbx policy ls --json`.
 */
export type NetworkMode = 'allow-all' | 'restricted' | 'deny-all';

export interface NetworkPolicySummary {
	mode: NetworkMode;
	/** Number of hosts allowed by global network rules. */
	allowedResourceCount: number;
	deniedResourceCount: number;
}

export type SettingValue = boolean | number | string | null | readonly unknown[] | Readonly<Record<string, unknown>>;

export interface SbxIntrospection {
	/** Does NOT enforce the pinned version: the prerequisite check reports the mismatch itself. */
	readVersion(): Promise<SbxVersionInfo>;
	readDiagnose(): Promise<SbxDiagnoseReport>;
	readNetworkPolicy(): Promise<NetworkPolicySummary>;
	/** Returns undefined when sbx has no such setting key. */
	readSetting(key: string): Promise<SettingValue | undefined>;
}
