import { InvalidQueryError } from 'flow-core';

/** Registry ids are 8 lowercase hexadecimal characters (project-sdk isIdLike). */
const PROJECT_ID_PATTERN = /^[0-9a-f]{8}$/;

/** Message for a project id that is not shaped like a registry id; says how to find a valid one. */
export function invalidProjectIdMessage(projectId: string): string {
	return `Invalid project id '${projectId}': expected 8 lowercase hexadecimal characters (e.g. a1b2c3d4). List the ids with: project list`;
}

export function isProjectId(text: string): boolean {
	return PROJECT_ID_PATTERN.test(text);
}

/** The id as given, or an InvalidQueryError (400) when it is not a registry id. */
export function requireProjectId(projectId: string): string {
	if (!isProjectId(projectId)) {
		throw new InvalidQueryError(invalidProjectIdMessage(projectId));
	}
	return projectId;
}
