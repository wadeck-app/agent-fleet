import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { errorMessage } from '../errors.js';
import { FlowVersionError } from './FlowVersionError.js';

export interface RegisteredFlow {
	definition: FlowDefinition;
	/** YAML of the definition as it will be snapshotted. */
	text: string;
}

function loadMap(file: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = yaml.load(fs.readFileSync(file, 'utf8'), { schema: yaml.JSON_SCHEMA });
	} catch (err) {
		throw new FlowVersionError(
			`Cannot read the flow registry ${file}: ${errorMessage(err)}. Fix the file (it is a YAML map of flow id to flow).`,
			'registry-unreadable'
		);
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new FlowVersionError(
			`The flow registry ${file} must be a YAML map of flow id to flow definition.`,
			'registry-unreadable'
		);
	}
	return Object.fromEntries(Object.entries(parsed));
}

/**
 * The entry `flowId` of a flow registry file (`.flow/flows.yml`), as a definition. `includes:` (one level, relative to
 * the registry) are read first and the registry's own entries win. Returns undefined when the file or the entry
 * does not exist. An entry that delegates to an external file (`source:`) is refused: flow-cli does not resolve it.
 */
export function readRegisteredFlow(registryFile: string, flowId: string): RegisteredFlow | undefined {
	if (!fs.existsSync(registryFile)) {
		return undefined;
	}
	const own = loadMap(registryFile);
	const entries: Record<string, unknown> = {};
	const includes = own['includes'];
	if (includes !== undefined) {
		if (!Array.isArray(includes) || includes.some(item => typeof item !== 'string')) {
			throw new FlowVersionError(
				`'includes' in ${registryFile} must be a list of file paths.`,
				'registry-unreadable'
			);
		}
		for (const include of includes as string[]) {
			const includeFile = path.resolve(path.dirname(registryFile), include);
			if (!fs.existsSync(includeFile)) {
				throw new FlowVersionError(
					`${registryFile} includes ${include}, but ${includeFile} does not exist.`,
					'registry-unreadable'
				);
			}
			Object.assign(entries, loadMap(includeFile));
		}
	}
	Object.assign(entries, own);
	const entry = entries[flowId];
	if (entry === undefined || flowId === 'includes') {
		return undefined;
	}
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new FlowVersionError(
			`The registry entry '${flowId}' in ${registryFile} must be a map.`,
			'registry-unreadable'
		);
	}
	if ('source' in entry) {
		throw new FlowVersionError(
			`The registry entry '${flowId}' in ${registryFile} uses 'source:' (an external file), which flow run does not resolve. ` +
				'Inline the flow in the registry, or run the external file by its path.',
			'registry-unsupported'
		);
	}
	const definition = { id: flowId, ...(entry as object) } as FlowDefinition;
	return { definition, text: yaml.dump(definition) };
}
