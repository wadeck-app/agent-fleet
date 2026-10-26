import {
	type ConfigSchema,
	type ConfigSection,
	type NamedLayer,
	getConfigLayers,
	loadRegistry,
	mergeLayers,
	projectToolDir,
	validateLayer,
} from '@wadeck-app/project-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseFlowConfigFile } from '../daemon/parseFlowConfigFile.js';
import type { ResolvedProject } from './ProjectScopeResolver.js';

/** What of a resolved project the config needs. */
export type ProjectConfigSubject = Pick<ResolvedProject, 'id' | 'name' | 'path' | 'registryDir'>;

/** A project's merged config and the files it came from (none when the project has no config). */
export interface LoadedProjectConfig {
	values: Record<string, unknown>;
	files: string[];
}

const TOOL = 'flow';
const CONFIG_FILE = 'config.yml';

/**
 * Plugin points a `plugins:` section may name. The last five are not pluggable yet: they are declared so the daemon's
 * own error (which says what is used instead) is the one the user reads, not a generic "not declared".
 */
const PLUGIN_POINTS = [
	'workspace',
	'tasks',
	'secrets',
	'approval',
	'authentication',
	'workerAcceptance',
	'stepDistribution',
	'provisioning',
	'interactivityPolicy',
] as const;

function fieldsWithScope(names: readonly string[], scope: 'global' | 'local'): NonNullable<ConfigSection['fields']> {
	return Object.fromEntries(names.map(name => [name, { scope }]));
}

/** Top-level keys of the daemon's own config (`~/.config/flow/config.yml`): in a project config they do nothing. */
const GLOBAL_ONLY_KEYS = [
	'autoUpdate',
	'checkInterval',
	'queue',
	'logs',
	'worker',
	'security',
	'limits',
	'workspace',
	'opencode',
] as const;

/**
 * The config of one project (`<registry>/projects/<id>/flow/config/config.yml`). `plugins` and `hooks` are `local`: a parent
 * project must not change the approval or workspace plugin, or the hooks, of a child. The daemon's keys are declared
 * global-only so that one written here is refused with where it belongs rather than ignored.
 */
export const FLOW_PROJECT_CONFIG_SCHEMA: ConfigSchema = {
	sections: {
		plugins: { scope: 'local', fields: fieldsWithScope(PLUGIN_POINTS, 'local') },
		hooks: { scope: 'local' },
		...Object.fromEntries(GLOBAL_ONLY_KEYS.map(key => [key, { scope: 'global' as const }])),
	},
};

/**
 * The part of the global config this schema judges: where a project key would be misplaced. Every other key of that file
 * (`autoUpdate`, `queue`, ...) belongs to the daemon and the updater and is read by them, so it is not judged here.
 */
const FLOW_GLOBAL_PLUGINS_SCHEMA: ConfigSchema = {
	sections: {
		plugins: {
			scope: 'global',
			fields: { instances: { scope: 'global' }, ...fieldsWithScope(PLUGIN_POINTS.slice(4), 'global') },
		},
		hooks: { scope: 'local' },
	},
};

/** The project config file, in the project registry (it may not exist). */
export function projectConfigFile(registryDir: string, projectId: string): string {
	return path.join(projectToolDir(registryDir, projectId, TOOL, 'config'), CONFIG_FILE);
}

/** Where the config of a project lived before it moved to the registry. */
export function legacyProjectConfigFile(projectPath: string): string {
	return path.join(projectPath, '.flow', CONFIG_FILE);
}

/**
 * @throws Error when the repository still holds a `.flow/config.yml`: it is no longer read, and silently ignoring its
 * hooks or plugins would let a run start without them. The message gives the command that moves it.
 */
function assertNoLegacyConfig(project: ProjectConfigSubject): void {
	if (project.path === undefined) {
		return;
	}
	const legacy = legacyProjectConfigFile(project.path);
	if (!fs.existsSync(legacy)) {
		return;
	}
	const target = projectConfigFile(project.registryDir, project.id);
	const directory = path.dirname(target);
	const both = fs.existsSync(target);
	throw new Error(
		`"${legacy}" is no longer read: the flow config of project ${project.name} (${project.id}) now lives in the project registry, at "${target}".\n` +
			(both
				? `Both exist: merge the content of the old file into the new one, then delete the old one: rm "${legacy}"\n`
				: `Move it: mkdir -p "${directory}" && mv "${legacy}" "${target}"\n` +
					`(PowerShell: New-Item -ItemType Directory -Force "${directory}"; Move-Item "${legacy}" "${target}")\n`) +
			`Then check the keys it holds: only plugins and hooks belong in a project config; daemon settings (queue, worker, ...) go in the global config.`
	);
}

/**
 * The flow config of a project: the config files of the project and its ancestors (root first), each checked against
 * {@link FLOW_PROJECT_CONFIG_SCHEMA}, then merged. A file that cannot be parsed, an unknown or misplaced key and a leftover
 * `.flow/config.yml` in the repository are errors naming the file; nothing is skipped.
 *
 * @throws ConfigSchemaError for a key that is not allowed in a project config (names the file, the key and the fix).
 * @throws Error for a leftover repository config or a file that cannot be parsed.
 */
export function loadProjectConfig(project: ProjectConfigSubject): LoadedProjectConfig {
	assertNoLegacyConfig(project);
	const registry = loadRegistry(project.registryDir);
	const own = registry.projects.find(candidate => candidate.id === project.id);
	if (own === undefined) {
		throw new Error(
			`project ${project.name} (${project.id}) is not in the project registry "${project.registryDir}"; check it with: project list`
		);
	}
	const layers: NamedLayer[] = [];
	const files: string[] = [];
	for (const layer of getConfigLayers(registry, project.registryDir, own, TOOL)) {
		const file = path.join(layer.dir, CONFIG_FILE);
		if (!fs.existsSync(file)) {
			continue;
		}
		const values = parseFlowConfigFile(file) ?? {};
		validateLayer(FLOW_PROJECT_CONFIG_SCHEMA, file, values, 'project');
		layers.push({ name: file, values });
		files.push(file);
	}
	return { values: mergeLayers(FLOW_PROJECT_CONFIG_SCHEMA, layers).values, files };
}

/** Checks one project-config file given by path (tests, `FLOW_CONFIG`-like overrides) with the same rules as {@link loadProjectConfig}. */
export function validateProjectConfigLayer(file: string, values: object): void {
	// violations-suppress: ts/no-unsafe-type-cast parsed YAML has no static shape; validateLayer checks every key
	validateLayer(FLOW_PROJECT_CONFIG_SCHEMA, file, values as Record<string, unknown>, 'project');
}

/**
 * Refuses, in the global config, what only a project config may hold (`hooks`) and any `plugins` entry other than
 * `instances`. The rest of that file is the daemon's and is not judged.
 *
 * @throws ConfigSchemaError naming the file, the key and where it goes.
 */
export function validateGlobalConfigLayer(file: string, values: object): void {
	// violations-suppress: ts/no-unsafe-type-cast parsed YAML has no static shape; only the keys read below are judged
	const parsed = values as Record<string, unknown>;
	const judged: Record<string, unknown> = {};
	for (const key of ['plugins', 'hooks']) {
		if (parsed[key] !== undefined) {
			judged[key] = parsed[key];
		}
	}
	validateLayer(FLOW_GLOBAL_PLUGINS_SCHEMA, file, judged, 'global');
}
