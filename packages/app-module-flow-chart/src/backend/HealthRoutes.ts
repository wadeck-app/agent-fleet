import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type FlowQueryService, errorMessage } from 'flow-core';

export interface HealthCheck {
	name: string;
	ok: boolean;
	detail?: string;
}

type CheckOutcome = Omit<HealthCheck, 'name'>;

/** Runs one check: a throw is a failed check carrying the error text, never a 5xx. */
function runCheck(name: string, check: () => CheckOutcome): HealthCheck {
	try {
		return { name, ...check() };
	} catch (err) {
		return { name, ok: false, detail: errorMessage(err) };
	}
}

/**
 * `GET /health` (app-core-cli update test, not a page source): read-only checks of what the pages rely on, the flow
 * definitions the index lists and the graph of the first one (the code path of `GET /graph`). No flow known is ok.
 * Both checks are synchronous reads of local files, so there is no timeout to apply.
 */
export function registerHealthRoutes(ctx: ModuleContext, service: FlowQueryService): void {
	ctx.registerRoute('GET', '/health', (_req, reply) => {
		let firstFlowId: string | undefined;
		const definitions = runCheck('flow-definitions', () => {
			try {
				firstFlowId = service.listFlows()[0]?.flowId;
			} catch (err) {
				return {
					ok: false,
					detail: `Cannot read the flows in ${service.directories.executionsDir}: ${errorMessage(err)}`,
				};
			}
			return firstFlowId === undefined ? { ok: true, detail: 'no flow known' } : { ok: true };
		});
		const flowId = firstFlowId;
		const graph = runCheck('flow-graph', () => {
			if (flowId === undefined) {
				return { ok: true, detail: 'no flow known' };
			}
			try {
				service.getFlowGraph({ flowId });
			} catch (err) {
				return { ok: false, detail: `The graph of flow ${flowId} does not build: ${errorMessage(err)}` };
			}
			return { ok: true };
		});
		const checks = [definitions, graph];
		return reply.code(200).send({ ok: checks.every(check => check.ok), checks });
	});
}
