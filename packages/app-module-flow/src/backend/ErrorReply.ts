import type { ModuleRouteHandler } from '@wadeck-app/app-core-sdk';
import {
	ExecutionLookupError,
	FlowCoreError,
	InvalidQueryError,
	UnknownPluginError,
	WorkerListError,
	errorMessage,
} from 'flow-core';

type Reply = Parameters<ModuleRouteHandler>[1];

function statusOf(err: unknown): number | undefined {
	if (err instanceof InvalidQueryError) return 400;
	if (err instanceof UnknownPluginError) return 404;
	if (err instanceof ExecutionLookupError) {
		switch (err.kind) {
			case 'invalid-id':
				return 400;
			case 'not-found':
				return 404;
			case 'ambiguous':
				return 409;
			case 'corrupt':
			case 'invalid-record':
				return 422;
			default: {
				const unreachable: never = err.kind;
				throw new Error(
					`Unmapped ExecutionLookupError kind '${String(unreachable)}': add it to ErrorReply.statusOf.`
				);
			}
		}
	}
	// The daemon (upstream of this module) answered, but not with a worker list: a gateway-style failure, not a bug here.
	if (err instanceof WorkerListError) return 502;
	return undefined;
}

/**
 * The one place that turns what flow-core throws into an HTTP answer. flow-core errors carry messages
 * that are already actionable, so they are passed through; anything else is a bug and is labelled so.
 */
export function replyWithError(reply: Reply, err: unknown): void {
	const status = statusOf(err);
	if (status !== undefined) {
		reply.code(status).send({ error: errorMessage(err) });
		return;
	}
	if (err instanceof FlowCoreError) {
		reply.code(500).send({ error: err.message });
		return;
	}
	reply.code(500).send({ error: `Unexpected error while serving the request: ${errorMessage(err)}` });
}
