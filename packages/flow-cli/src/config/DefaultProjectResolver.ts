import type { ProjectResolution, ProjectResolutionProvider } from 'extension-points';
import { existsSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

/** Marker whose presence defines a project root. */
const PROJECT_CONFIG = join('.flow', 'config.yml');

/**
 * Legacy markers, kept as an actionable diagnostic only (D#49).
 *
 * These are deliberately CONFIG FILES, never directories: `.agent-fleet/` and
 * `.flow/` both double as runtime workspace directories, so a stray
 * `.agent-fleet/workspaces/` left behind by an old run must not be mistaken for
 * a project (D#50).
 */
const LEGACY_CONFIGS = [
	join('.agent-fleet', 'flows.yml'),
	join('.agent-fleet', 'flows-custom.yml'),
	join('.flows', 'config.yml'),
];

/**
 * Thrown when a directory belongs to no resolvable project.
 * Distinct from {@link LegacyProjectLayoutError} so callers can tell "not a
 * project" apart from "a project that needs migrating".
 */
export class ProjectRootNotFoundError extends Error {
	constructor(startDir: string) {
		super(
			`No project root found for "${startDir}".\n` +
				`Looked for ".flow/config.yml" in that directory and every parent, then for a ".git" root.\n` +
				`Create ".flow/config.yml" at your project root, or run the command from inside a git repository.`
		);
		this.name = 'ProjectRootNotFoundError';
	}
}

/** Thrown when only the pre-consolidation layout is present (D#49). */
export class LegacyProjectLayoutError extends Error {
	constructor(projectRoot: string, foundConfigs: string[]) {
		const found = foundConfigs.map(c => `  - ${join(projectRoot, c)}`).join('\n');
		super(
			`Legacy flow layout detected in "${projectRoot}" and no ".flow/config.yml".\n` +
				`These files must be moved into ".flow/":\n${found}\n` +
				`Expected layout:\n` +
				`  .flow/config.yml         (merge of .flow/config.yml and .flows/config.yml)\n` +
				`  .flow/flows.yml          (from .agent-fleet/flows.yml)\n` +
				`  .flow/flows-custom.yml   (from .agent-fleet/flows-custom.yml)`
		);
		this.name = 'LegacyProjectLayoutError';
	}
}

/**
 * Built-in `project-resolution` implementation: walks up for `.flow/config.yml`,
 * then for a `.git` root, and fails loudly when neither is found (D#40).
 *
 * Precedence is deterministic and absence is an error -- never a silent fallback
 * to the working directory.
 */
export class DefaultProjectResolver implements ProjectResolutionProvider {
	resolve(startDir: string): ProjectResolution {
		const start = resolve(startDir);

		// A single walk collects every candidate, so precedence is applied once
		// below rather than by the order of three separate walks.
		let configRoot: string | undefined;
		let gitRoot: string | undefined;
		let legacy: { root: string; configs: string[] } | undefined;

		for (const dir of ancestors(start)) {
			if (configRoot === undefined && existsSync(join(dir, PROJECT_CONFIG))) {
				configRoot = dir;
				// Nearest project config wins outright; nothing further up can outrank it.
				break;
			}
			if (legacy === undefined) {
				const configs = LEGACY_CONFIGS.filter(c => existsSync(join(dir, c)));
				if (configs.length > 0) {
					legacy = { root: dir, configs };
				}
			}
			// `.git` is a FILE, not a directory, inside a git worktree.
			if (gitRoot === undefined && existsSync(join(dir, '.git'))) {
				gitRoot = dir;
			}
		}

		if (configRoot !== undefined) {
			return { projectRoot: configRoot, via: PROJECT_CONFIG };
		}

		// Before the `.git` fallback: a legacy project has a git root, and
		// returning it would surface as a confusing "flow not found" instead of
		// telling the user which files to move.
		if (legacy !== undefined) {
			throw new LegacyProjectLayoutError(legacy.root, legacy.configs);
		}

		if (gitRoot !== undefined) {
			return { projectRoot: gitRoot, via: '.git' };
		}

		throw new ProjectRootNotFoundError(start);
	}
}

/** Yields `dir` and each parent, ending with the filesystem root. */
function* ancestors(dir: string): Generator<string> {
	const { root } = parse(dir);
	let current = dir;
	while (true) {
		yield current;
		if (current === root) return;
		const parent = dirname(current);
		// Defensive: dirname() is a fixpoint at the root on every platform.
		if (parent === current) return;
		current = parent;
	}
}
