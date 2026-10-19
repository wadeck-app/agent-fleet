import { ConfigDir } from '@wadeck-app/shared-cli';
import { FLOW_CONFIG_DIR_NAME } from 'flow-core';

/**
 * The one place that decides where flow keeps its files (config.yml, logs/, executions/, daemon port
 * file, worker sources): `<XDG_CONFIG_HOME or ~/.config>/flow`. Resolved on each call so a test or a
 * wrapper that changes the environment is honoured. Commands take it as a defaulted parameter so tests
 * can inject a throwaway directory.
 */
export function flowConfigDir(): string {
	return ConfigDir.get(FLOW_CONFIG_DIR_NAME);
}
