import * as path from 'node:path';

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
