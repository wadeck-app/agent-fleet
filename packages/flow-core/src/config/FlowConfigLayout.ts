import * as path from 'node:path';

import { FlowCoreError } from '../errors.js';

// Where flow keeps its files. flow-core never resolves the config directory itself (hosts do, with
// ConfigDir.get(FLOW_CONFIG_DIR_NAME)), but every host and the daemon must agree on the names below.

/** Name passed to ConfigDir.get(): `<XDG_CONFIG_HOME or ~/.config>/flow`. */
export const FLOW_CONFIG_DIR_NAME = 'flow';

/** Where the daemon persists one `<id>.json` per execution. */
export function executionsDirOf(configDir: string): string {
	return path.join(configDir, 'executions');
}

/** Where the daemon writes its daily `YYYY-MM-DD.ndjson` logs. */
export function logsDirOf(configDir: string): string {
	return path.join(configDir, 'logs');
}

/**
 * Where the daemon keeps one immutable snapshot of every flow definition it ran (or was asked to run):
 * `definitions/<flowId>/<version>-<hash12>.yml`. Only this file builds those paths, so moving flow state
 * (for example under a per-project directory) is a change here and nowhere else.
 */
export function definitionsDirOf(configDir: string): string {
	return path.join(configDir, 'definitions');
}

const FLOW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SNAPSHOT_REF_PATTERN = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/(\d+\.\d+\.\d+[0-9A-Za-z.-]*-[0-9a-f]{12}\.yml)$/;

/** Throws when the flow id cannot safely be a directory name. */
export function assertFlowIdSafeForPath(flowId: string): void {
	if (!FLOW_ID_PATTERN.test(flowId)) {
		throw new FlowCoreError(
			`The flow id ${JSON.stringify(flowId)} cannot be versioned: use only [A-Za-z0-9._-], starting with a letter or digit. ` +
				'Rename the flow id (or pass --flow-id with a valid one).',
			'flow-id-invalid'
		);
	}
}

/** The reference stored on an execution record: `<flowId>/<version>-<hash12>.yml`, relative to the definitions directory. */
export function definitionSnapshotRefOf(flowId: string, version: string, hash: string): string {
	assertFlowIdSafeForPath(flowId);
	return `${flowId}/${version}-${hash.slice(0, 12)}.yml`;
}

/** The directory holding the snapshots of one flow. */
export function definitionFlowDirOf(definitionsDir: string, flowId: string): string {
	assertFlowIdSafeForPath(flowId);
	return path.join(definitionsDir, flowId);
}

/** Absolute path of a snapshot reference; refuses anything that is not `<flowId>/<file>`. */
export function definitionSnapshotPathOf(definitionsDir: string, ref: string): string {
	const match = SNAPSHOT_REF_PATTERN.exec(ref);
	if (!match) {
		throw new FlowCoreError(
			`Invalid definition snapshot reference ${JSON.stringify(ref)}: expected <flowId>/<version>-<hash12>.yml. ` +
				'The execution record may be damaged.',
			'snapshot-ref-invalid'
		);
	}
	return path.join(definitionsDir, match[1]!, match[2]!);
}
