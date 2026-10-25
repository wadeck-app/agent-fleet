import { isSemanticVersion } from 'flow-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { ProjectScopeError, ProjectScopeResolver } from '../../config/ProjectScopeResolver';

/** What `flow run <ref>` points at: a flow file (runs as it is) or a flow id, optionally pinned to a version. */
export type FlowReference =
	| { kind: 'file'; flowFile: string }
	| { kind: 'registered'; flowFile: string; flowId: string; flowVersion: string | undefined }
	| { kind: 'error'; error: string };

/** Which project a registered flow id is looked up in: `--project`, else `FLOW_PROJECT` (read from `env`), else the cwd. */
export interface FlowProjectSelection {
	projectRef?: string;
	env?: NodeJS.ProcessEnv;
}

/**
 * An existing file always wins (so a path containing an `@` still works). Otherwise `<ref>` is a flow id, with an
 * optional `@<semver>` suffix pinning the version: `flow run my-flow@1.2.0`. The registry file is the project's
 * `.flow/flows.yml`; it may not exist, snapshots of earlier runs can still serve the id (the daemon decides).
 */
export function resolveFlowReference(ref: string, cwd: string, selection: FlowProjectSelection = {}): FlowReference {
	const resolvedPath = path.isAbsolute(ref) ? ref : path.resolve(cwd, ref);
	if (fs.existsSync(resolvedPath)) {
		return { kind: 'file', flowFile: resolvedPath };
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
	let projectRoot: string;
	try {
		const resolver = new ProjectScopeResolver();
		projectRoot = resolver.requirePath(
			resolver.resolve({
				cwd,
				...(selection.projectRef === undefined ? {} : { projectRef: selection.projectRef }),
				...(selection.env === undefined ? {} : { env: selection.env }),
			})
		);
	} catch (err) {
		if (!(err instanceof ProjectScopeError)) {
			throw err;
		}
		// The resolver's message already says what to do (register the folder, fix the reference): surface it as it is.
		return { kind: 'error', error: `Flow '${ref}' not found as a file.\n${getErrorMessage(err)}` };
	}
	return { kind: 'registered', flowFile: path.join(projectRoot, '.flow', 'flows.yml'), flowId, flowVersion };
}
