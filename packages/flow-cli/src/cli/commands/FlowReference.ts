import { DefinitionSnapshotStore, FlowCoreError, definitionsDirOf, isSemanticVersion } from 'flow-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { ProjectScopeError, ProjectScopeResolver, type ResolvedProject } from '../../config/ProjectScopeResolver';
import { listRegisteredFlowIds } from './RegisteredFlowIds';

/** What `flow run <ref>` points at: a flow file (runs as it is) or a flow id, optionally pinned to a version. */
export type FlowReference =
	| { kind: 'file'; flowFile: string }
	| { kind: 'registered'; flowFile: string; flowId: string; flowVersion: string | undefined }
	| { kind: 'error'; error: string };

/** Which project a registered flow id is looked up in: `--project`, else `FLOW_PROJECT` (read from `env`), else the cwd. */
export interface FlowProjectSelection {
	projectRef?: string;
	env?: NodeJS.ProcessEnv;
	/** Flow config directory (holds the snapshots of earlier runs). Given: an id known nowhere is refused with the registered ids. */
	configDir?: string;
}

/** How many registered ids a "no such flow" message lists before cutting with `...`. */
const LISTED_FLOW_IDS = 10;

/**
 * Whether `ref` can only be meant as a file path: it contains a path separator, ends with `.yml`/`.yaml`, starts with `~`,
 * or starts with a drive letter (`C:`). Flow ids and `id@version` never do (an id has no separator, no `:`, no `~`).
 * Decided on the text alone, so Windows paths classify the same on every platform.
 */
export function isFileLikeReference(ref: string): boolean {
	return /[\\/]/.test(ref) || /\.ya?ml$/i.test(ref) || ref.startsWith('~') || /^[A-Za-z]:/.test(ref);
}

/** `Flow file not found: <absolute path> (cwd: <cwd>). <hint>`: the one wording every command uses for a missing flow file. */
export function describeMissingFlowFile(ref: string, cwd: string, hint: string): string {
	return `Flow file not found: ${path.resolve(cwd, ref)} (cwd: ${cwd}). ${hint}`;
}

function projectOf(cwd: string, selection: FlowProjectSelection): ResolvedProject {
	const resolver = new ProjectScopeResolver();
	return resolver.resolve({
		cwd,
		...(selection.projectRef === undefined ? {} : { projectRef: selection.projectRef }),
		...(selection.env === undefined ? {} : { env: selection.env }),
	});
}

function missingFileError(ref: string, cwd: string, selection: FlowProjectSelection): FlowReference {
	let hint = 'Pass an existing .yml file, or a registered flow id';
	try {
		hint += ` (see .flow/flows.yml of the project ${projectOf(cwd, selection).name}).`;
	} catch (err) {
		if (!(err instanceof ProjectScopeError)) {
			throw err;
		}
		// No project is selected: the message stays true without naming one.
		hint += '.';
	}
	return { kind: 'error', error: describeMissingFlowFile(ref, cwd, hint) };
}

function hasSnapshots(configDir: string, flowId: string): boolean {
	try {
		return new DefinitionSnapshotStore(definitionsDirOf(configDir)).list(flowId).length > 0;
	} catch (err) {
		// An id that cannot name a snapshot directory has none.
		if (err instanceof FlowCoreError) {
			return false;
		}
		throw err;
	}
}

/** An error when `flowId` is neither in the registry file nor served by a snapshot of an earlier run; undefined otherwise. */
function unregisteredFlowError(
	flowId: string,
	project: ResolvedProject,
	registryFile: string,
	configDir: string
): FlowReference | undefined {
	const ids = listRegisteredFlowIds(registryFile);
	if (ids === undefined || ids.includes(flowId) || hasSnapshots(configDir, flowId)) {
		return undefined;
	}
	const listed =
		ids.length === 0
			? 'none (no .flow/flows.yml in the project)'
			: ids.slice(0, LISTED_FLOW_IDS).join(', ') + (ids.length > LISTED_FLOW_IDS ? ', ...' : '');
	return {
		kind: 'error',
		error:
			`No registered flow "${flowId}" in project ${project.name} (${project.id}). ` +
			`Registered flows: ${listed}. To run a file pass its path.`,
	};
}

/**
 * An existing file always wins (so a path containing an `@` still works). A reference that can only be a path
 * ({@link isFileLikeReference}) and does not exist is a missing-file error. Otherwise `<ref>` is a flow id, with an
 * optional `@<semver>` suffix pinning the version: `flow run my-flow@1.2.0`. The registry file is the project's
 * `.flow/flows.yml`; when `selection.configDir` is given, an id found neither there nor in a snapshot of an earlier
 * run is refused here, naming the registered ids (an unreadable registry is left to the daemon to report).
 */
export function resolveFlowReference(ref: string, cwd: string, selection: FlowProjectSelection = {}): FlowReference {
	const resolvedPath = path.isAbsolute(ref) ? ref : path.resolve(cwd, ref);
	if (fs.existsSync(resolvedPath)) {
		return { kind: 'file', flowFile: resolvedPath };
	}
	if (isFileLikeReference(ref)) {
		return missingFileError(ref, cwd, selection);
	}
	let flowId = ref;
	let flowVersion: string | undefined;
	const at = ref.lastIndexOf('@');
	if (at >= 0) {
		flowId = ref.slice(0, at);
		flowVersion = ref.slice(at + 1);
		if (flowId === '' || !isSemanticVersion(flowVersion)) {
			return {
				kind: 'error',
				error:
					`Flow '${ref}' not found as a file, and it is not a valid <flow-id>@MAJOR.MINOR.PATCH reference ` +
					'(for example my-flow@1.2.0). List the versions of a flow with: flow versions <flow-id>',
			};
		}
	}
	let project: ResolvedProject;
	let projectRoot: string;
	try {
		project = projectOf(cwd, selection);
		projectRoot = new ProjectScopeResolver().requirePath(project);
	} catch (err) {
		if (!(err instanceof ProjectScopeError)) {
			throw err;
		}
		// The resolver's message already says what to do (register the folder, fix the reference): surface it as it is.
		return { kind: 'error', error: `Flow '${ref}' not found as a file.\n${getErrorMessage(err)}` };
	}
	const flowFile = path.join(projectRoot, '.flow', 'flows.yml');
	if (selection.configDir !== undefined) {
		const unregistered = unregisteredFlowError(flowId, project, flowFile, selection.configDir);
		if (unregistered !== undefined) {
			return unregistered;
		}
	}
	return { kind: 'registered', flowFile, flowId, flowVersion };
}
