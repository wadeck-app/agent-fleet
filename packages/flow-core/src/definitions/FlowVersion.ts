import { FlowVersionError } from './FlowVersionError.js';
import { isSemanticVersion } from './SemanticVersion.js';

/** Version of a flow that declares none; it never triggers the same-version-different-content refusal. */
export const UNVERSIONED = '0.0.0';

export interface DeclaredVersion {
	version: string;
	/** True when the flow has no `version` field (so {@link UNVERSIONED} is assumed). */
	implicit: boolean;
}

/** The warning shown (validate, run log) for a flow without a version. */
export function missingVersionWarning(flowId: string): string {
	return (
		`Flow '${flowId}' has no version: it is treated as ${UNVERSIONED}, so runs cannot be pinned or told apart. ` +
		"Add a line like `version: '1.0.0'` at the top of the flow file."
	);
}

/** Reads the `version` of a parsed flow; throws FlowVersionError('version-invalid') when it is not a semver string. */
export function readFlowVersion(flow: unknown, label: string): DeclaredVersion {
	const declared = (flow as { version?: unknown } | null)?.version;
	if (declared === undefined || declared === null) {
		return { version: UNVERSIONED, implicit: true };
	}
	if (typeof declared !== 'string' || !isSemanticVersion(declared)) {
		throw new FlowVersionError(
			`Flow ${label} declares version ${JSON.stringify(declared)}, which is not a semantic version. ` +
				"Use a quoted MAJOR.MINOR.PATCH string such as version: '1.2.0' (a prerelease like '1.3.0-rc.1' is allowed; " +
				'unquoted 1.0 or 2 is read as a number).',
			'version-invalid'
		);
	}
	return { version: declared, implicit: false };
}
