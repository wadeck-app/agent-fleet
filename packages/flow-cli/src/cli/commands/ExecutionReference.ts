import {
	InvalidQualifiedIdError,
	ProjectError,
	defaultRegistryDir,
	loadRegistry,
	resolveQualifiedId,
} from '@wadeck-app/project-sdk';
import { ExecutionLookupError, FlowQueryService, createRegistryProjectLookup, projectLabelOf } from 'flow-core';
import type { ProjectLookup } from 'flow-core';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import { formatCliError } from './CliErrorOutput';
import { resolveProjectFilter } from './ProjectFilter';

/** A reference to an execution could not be used; `message` is final and actionable, print it as it is. */
export class ExecutionReferenceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ExecutionReferenceError';
	}
}

/** The execution a command works on and, when the user named one, the project it must belong to. */
export interface ExecutionReference {
	/** The local id (or unique prefix), without any project part. */
	executionId: string;
	/** Registry id of the project the execution must belong to. Absent: any project (the behaviour of a plain id). */
	projectId?: string;
}

const FORM_HINT = 'Write the id as <project>/<id> (e.g. shop/abc12345), or just <id>.';

// <project>/<id>, or its malformed neighbours (`shop/`): one '/', no backslash, no dot in the project part (a path such as ./a/b or flows/a.yml stays a path).
const QUALIFIED_TARGET_RE = /^[^/\\.][^/\\]*\/[a-z0-9]*$/;

/**
 * Whether a `flow show` target is written as `<project>/<id>` rather than as a path. Only meant to be asked after
 * "is it an existing file" (a file always wins).
 */
export function isQualifiedExecutionTarget(target: string): boolean {
	return QUALIFIED_TARGET_RE.test(target);
}

/**
 * Splits `<project>/<id>` with the shared project resolution (name or alias, then id, then unique id prefix) and combines
 * it with `-p/--project`.
 *
 * - No slash: the id is returned as typed, scoped to `-p`/`FLOW_PROJECT` when there is one, exactly as before.
 * - With a slash: the project part selects the project. `-p` naming ANOTHER project is an error (never a silent choice);
 *   an ambient FLOW_PROJECT is only a default, so the explicit project part wins over it.
 *
 * The id part is not looked up here: the caller finds the execution (prefix rule unchanged) and calls
 * {@link assertExecutionInProject} on it.
 *
 * @throws ExecutionReferenceError. An unresolved `-p` exits 1 through {@link resolveProjectFilter}, like every project flag.
 */
export function resolveExecutionReference(
	input: string,
	projectFlag: string | undefined,
	env: NodeJS.ProcessEnv
): ExecutionReference {
	const scopedProjectId = resolveProjectFilter(projectFlag, env);
	if (!input.includes('/')) {
		return { executionId: input, ...(scopedProjectId === undefined ? {} : { projectId: scopedProjectId }) };
	}
	const registryDir = defaultRegistryDir(env);
	let resolved: { project: { id: string }; id: string };
	try {
		resolved = resolveQualifiedId(loadRegistry(registryDir), input);
	} catch (err) {
		if (!(err instanceof ProjectError)) {
			throw err;
		}
		const hint = err instanceof InvalidQualifiedIdError ? `\n${FORM_HINT}` : '';
		// SDK messages are written for users: they name the reference, the close names (did you mean) or the candidates.
		throw new ExecutionReferenceError(`Execution id "${input}": ${normalizeError(err).message}${hint}`);
	}
	if (projectFlag !== undefined && scopedProjectId !== resolved.project.id) {
		const lookup = createRegistryProjectLookup(registryDir);
		throw new ExecutionReferenceError(
			`Execution id "${input}" names project ${labelOf(resolved.project.id, lookup)} but --project selects ` +
				`${labelOf(scopedProjectId ?? '', lookup)}. Drop one of the two, or make them name the same project.`
		);
	}
	return { executionId: resolved.id, projectId: resolved.project.id };
}

function labelOf(projectId: string, lookup: ProjectLookup): string {
	return projectLabelOf({ projectId }, lookup) ?? projectId;
}

/**
 * The execution must belong to the project the user named. A record written before project ids existed belongs to none.
 * No `projectId`: nothing to check.
 *
 * @throws ExecutionReferenceError naming both projects.
 */
export function assertExecutionInProject(
	record: { executionId: string; projectId?: string; projectRoot?: string },
	projectId: string | undefined,
	lookup: ProjectLookup
): void {
	if (projectId === undefined || record.projectId === projectId) {
		return;
	}
	const owner = projectLabelOf(record, lookup) ?? 'no project recorded';
	const wanted = labelOf(projectId, lookup);
	const ownerHint = record.projectId === undefined ? 'Drop the project part to use it.' : `Write it as ${record.projectId}/${record.executionId}, or drop the project part.`;
	throw new ExecutionReferenceError(
		`Execution "${record.executionId}" belongs to ${owner}, not to the project ${wanted} that was named. ${ownerHint}`
	);
}

/**
 * Runs `action`; an {@link ExecutionReferenceError} or ExecutionLookupError is printed as `Error: <message>` and ends the command with exit 1,
 * so every command words and exits the same way.
 */
export function exitOnReferenceError<T>(action: () => T): T {
	try {
		return action();
	} catch (err) {
		// An ExecutionLookupError message is already actionable (no match, several matches).
		if (err instanceof ExecutionReferenceError || err instanceof ExecutionLookupError) {
			console.error(formatCliError(err.message));
			return process.exit(1);
		}
		throw err;
	}
}

/**
 * Finds the stored execution of `reference` (id or unique prefix, as `flow show` does) and checks it belongs to the
 * project the reference names, if any.
 *
 * @throws ExecutionLookupError when no record matches (or several do), ExecutionReferenceError on another project's execution.
 */
export function assertStoredExecutionInProject(
	service: FlowQueryService,
	reference: ExecutionReference,
	env: NodeJS.ProcessEnv
): void {
	if (reference.projectId === undefined) {
		return;
	}
	const { record } = service.getExecution(reference.executionId);
	assertExecutionInProject(record, reference.projectId, createRegistryProjectLookup(defaultRegistryDir(env)));
}

/**
 * For the commands that act through the daemon (cancel, resume): when the user wrote `<project>/<id>`, checks on the
 * stored record that the execution belongs to that project BEFORE the daemon is asked. A record that cannot be found is
 * left to the command's own "not found" answer (the daemon, or the disk when it is not running). A plain id is not checked.
 */
export function assertQualifiedExecutionOwner(
	input: string,
	reference: ExecutionReference,
	configDir: string,
	env: NodeJS.ProcessEnv
): void {
	if (!input.includes('/')) {
		return;
	}
	try {
		assertStoredExecutionInProject(FlowQueryService.forConfigDir(configDir), reference, env);
	} catch (err) {
		if (!(err instanceof ExecutionLookupError)) {
			throw err;
		}
	}
}
