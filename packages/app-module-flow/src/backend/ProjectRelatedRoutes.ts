import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type ExecutionStatus, type FlowQueryService, type ProjectFinder, executionPagePath } from 'flow-core';

import { replyWithError } from './ErrorReply.js';
import { invalidProjectIdMessage, isProjectId } from './ProjectIdQuery.js';

export const RELATED_ITEMS_LIMIT = 10;
export const RELATED_TITLE = 'Flow executions';
// The project module shows the count as "{count} {countLabel}".
export const RELATED_COUNT_LABEL = 'running or queued';

export interface ProjectRelatedResponse {
	title: string;
	count: number;
	countLabel: string;
	items: { label: string; subtitle: string; url: string }[];
	moreUrl: string;
	project: { name: string; removed: boolean; virtual: boolean };
}

// Typed against ExecutionStatus so a status renamed in flow-core fails the build here. A queued run is the one that
// waits (its words in the executions page are "waiting"), 're-queued' is the same wait after a crash recovery.
const ACTIVE_STATUSES = ['running', 'queued', 're-queued'] as const satisfies readonly ExecutionStatus[];

/**
 * `GET /related/project/:projectId`: what the project module shows about the runs of one project (provider contract:
 * title, count of running and waiting runs, the 10 latest runs as label/url/subtitle, the page of all of them), plus
 * `project` (registry name, removed, virtual). Read-only; the registry is read on every request through `findProject`.
 * One scan of the executions directory, the same listing as the executions page; every failure is an error answer.
 */
export function registerProjectRelatedRoutes(
	ctx: ModuleContext,
	service: FlowQueryService,
	findProject: ProjectFinder
): void {
	ctx.registerRoute('GET', '/related/project/:projectId', (req, reply) => {
		try {
			const { projectId } = req.params as { projectId: string };
			if (!isProjectId(projectId)) {
				return reply.code(400).send({
					error: invalidProjectIdMessage(projectId),
				});
			}
			const found = findProject(projectId);
			if (found.kind === 'unknown') {
				return reply.code(404).send({
					error: `No project has the id '${projectId}'. List the registered projects with: project list`,
				});
			}
			if (found.kind === 'unavailable') {
				return reply.code(502).send({
					error: `Cannot tell whether project '${projectId}' exists: ${found.reason}. Check the registry with: project list`,
				});
			}
			// Computed before reply.code(): a failure must not leave a 200 status set on the error answer.
			const { items } = service.listExecutions({ projectId, limit: Number.MAX_SAFE_INTEGER });
			const body: ProjectRelatedResponse = {
				title: RELATED_TITLE,
				count: items.filter(item => (ACTIVE_STATUSES as readonly string[]).includes(item.status)).length,
				countLabel: RELATED_COUNT_LABEL,
				items: items.slice(0, RELATED_ITEMS_LIMIT).map(item => ({
					label: item.flowId,
					subtitle: `${item.status} - ${item.startedAt}`,
					url: executionPagePath(item.executionId),
				})),
				moreUrl: `/modules/flow/executions?project=${projectId}`,
				project: { name: found.name, removed: found.kind === 'removed', virtual: found.virtual },
			};
			return reply.code(200).send(body);
		} catch (err) {
			return replyWithError(reply, err);
		}
	});
}
