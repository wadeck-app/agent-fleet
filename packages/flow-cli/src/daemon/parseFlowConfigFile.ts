import * as yaml from 'js-yaml';
import * as fs from 'node:fs';

/**
 * Parses a flow `config.yml` into its top-level mapping, or null when the file is empty.
 *
 * Throws, naming the path, when the file cannot be read or parsed: callers that guessed
 * instead would either hide the typo or blame an unrelated missing setting for it.
 */
export function parseFlowConfigFile(configPath: string): Record<string, unknown> | null {
	try {
		return yaml.load(fs.readFileSync(configPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) as Record<
			string,
			unknown
		> | null;
	} catch (err) {
		throw new Error(`Failed to parse flow config at "${configPath}": ${String(err)}`);
	}
}
