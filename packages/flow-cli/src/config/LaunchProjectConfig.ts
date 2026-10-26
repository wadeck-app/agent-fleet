import { load as parseYaml } from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage, normalizeError } from 'shared-common/utils/getErrorMessage';

import { type LoadedProjectConfig, legacyProjectConfigFile, loadProjectConfig } from './ProjectFlowConfig.js';
import { ProjectScopeError, ProjectScopeResolver, type ResolvedProject } from './ProjectScopeResolver.js';

/** Whether a config file exists and declares a `plugins:` section. A file that cannot be parsed is an error, not "no plugins". */
function declaresPluginsSection(file: string): boolean {
	let content: string;
	try {
		content = fs.readFileSync(file, 'utf8');
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === 'ENOENT' || code === 'ENOTDIR') {
			return false;
		}
		throw err;
	}
	let parsed: unknown;
	try {
		parsed = parseYaml(content);
	} catch (err) {
		throw new Error(`Failed to parse flow config at "${file}": ${normalizeError(err).message}`);
	}
	return typeof parsed === 'object' && parsed !== null && 'plugins' in parsed;
}

/**
 * The flow config of the project that applies to the folder a process was launched from (the daemon, a worker), or null.
 *
 * The folder is resolved through the project registry like any other flow command (`FLOW_PROJECT` > cwd). A folder in no
 * project has no project config: that is reported on stderr, never silent. One thing is an error rather than a note: an
 * unregistered folder whose own `.flow/config.yml` declares `plugins:`, because those plugins used to be loaded and would
 * now stop applying without anyone noticing.
 *
 * The config of a registered project lives in the project registry (see `loadProjectConfig`); a leftover `.flow/config.yml`
 * in its repository is an error that gives the command to move it.
 *
 * @throws Error naming the file when it would be ignored, when it cannot be parsed, or when a key is not allowed there.
 */
export function launchProjectConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): LoadedProjectConfig | null {
	let project: ResolvedProject;
	try {
		const resolver = new ProjectScopeResolver();
		project = resolver.resolve({ cwd, env });
		resolver.requirePath(project);
	} catch (err) {
		if (!(err instanceof ProjectScopeError)) {
			throw err;
		}
		const literal = legacyProjectConfigFile(path.resolve(cwd));
		if (err.code === 'NO_PROJECT_IN_SCOPE' && declaresPluginsSection(literal)) {
			throw new Error(
				`"${literal}" declares plugins, but "${cwd}" is not in a registered project, so flow no longer loads it.\n` +
					`Register the folder once with: project add "${cwd}", then start flow from it again; flow then names the command that moves the file into the project registry.`
			);
		}
		process.stderr.write(`[flow] No project plugin config loaded. ${getErrorMessage(err)}\n`);
		return null;
	}
	return loadProjectConfig(project);
}
