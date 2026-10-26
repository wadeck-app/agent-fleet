import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readKeys(file: string): string[] | undefined {
	const parsed = yaml.load(fs.readFileSync(file, 'utf8'), { schema: yaml.JSON_SCHEMA });
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return undefined;
	}
	return Object.keys(parsed);
}

/**
 * The flow ids of a flow registry (`.flow/flows.yml`, plus its `includes:` files, one level), in declaration order. Only the
 * keys are read out: nothing of a flow's content (scripts, env, secrets) reaches the caller.
 *
 * Returns `[]` when the file does not exist and `undefined` when it cannot be read as a registry (the daemon reports that
 * with its own, more precise message).
 */
export function listRegisteredFlowIds(registryFile: string): string[] | undefined {
	if (!fs.existsSync(registryFile)) {
		return [];
	}
	try {
		const ids: string[] = [];
		const parsed = yaml.load(fs.readFileSync(registryFile, 'utf8'), { schema: yaml.JSON_SCHEMA });
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return undefined;
		}
		const includes: unknown = 'includes' in parsed ? parsed.includes : undefined;
		if (Array.isArray(includes)) {
			for (const include of includes) {
				if (typeof include !== 'string') {
					return undefined;
				}
				const keys = readKeys(path.resolve(path.dirname(registryFile), include));
				if (keys === undefined) {
					return undefined;
				}
				ids.push(...keys);
			}
		}
		ids.push(...Object.keys(parsed));
		return [...new Set(ids)].filter(id => id !== 'includes');
	} catch {
		// Unreadable YAML or a missing include: not this check's business, the daemon names the file and the problem.
		return undefined;
	}
}
