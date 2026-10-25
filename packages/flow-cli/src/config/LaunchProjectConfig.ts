import { load as parseYaml } from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage, normalizeError } from 'shared-common/utils/getErrorMessage';

import { ProjectScopeError, ProjectScopeResolver } from './ProjectScopeResolver.js';

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
 * The project `.flow/config.yml` that applies to the folder a process was launched from (the daemon, a worker), or null.
 *
 * The folder is resolved through the project registry like any other flow command (`FLOW_PROJECT` > cwd). A folder in no
 * project has no project config: that is reported on stderr, never silent. One thing is an error rather than a note: an
 * unregistered folder whose own `.flow/config.yml` declares `plugins:`, because those plugins used to be loaded and would
 * now stop applying without anyone noticing.
 *
 * @throws Error naming the file when it would be ignored, or when it cannot be parsed.
 */
export function launchProjectConfigPath(cwd: string, env: NodeJS.ProcessEnv = process.env): string | null {
	try {
		const resolver = new ProjectScopeResolver();
		const folder = resolver.requirePath(resolver.resolve({ cwd, env }));
		return path.join(folder, '.flow', 'config.yml');
	} catch (err) {
		if (!(err instanceof ProjectScopeError)) {
			throw err;
		}
		const literal = path.join(path.resolve(cwd), '.flow', 'config.yml');
		if (err.code === 'NO_PROJECT_IN_SCOPE' && declaresPluginsSection(literal)) {
			throw new Error(
				`"${literal}" declares plugins, but "${cwd}" is not in a registered project, so flow no longer loads it.\n` +
					`Register the folder once with: project add "${cwd}", then start flow from it again.`
			);
		}
		process.stderr.write(`[flow] No project plugin config loaded. ${getErrorMessage(err)}\n`);
		return null;
	}
}
