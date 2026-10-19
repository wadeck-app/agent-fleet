import { FlowCoreError, InvalidQueryError, errorMessage } from './errors.js';
import { FlowDefinitionError } from './graph/FlowDefinitionLoader.js';
import { UnknownPluginError } from './plugins/PluginCatalog.js';
import { ExecutionLookupError } from './show/ExecutionDetail.js';
import { WorkerListError } from './worker/WorkerList.js';

/** Host-neutral meaning of a failure; each host (HTTP, MCP...) maps it to its own status codes. */
export type FlowErrorCategory =
	'invalid-request' | 'not-found' | 'conflict' | 'unreadable-data' | 'upstream-failure' | 'internal' | 'unknown';

function classifyLookup(kind: ExecutionLookupError['kind']): FlowErrorCategory {
	switch (kind) {
		case 'invalid-id':
			return 'invalid-request';
		case 'not-found':
			return 'not-found';
		case 'ambiguous':
			return 'conflict';
		case 'corrupt':
		case 'invalid-record':
			return 'unreadable-data';
		default: {
			const unreachable: never = kind;
			throw new Error(
				`Unmapped ExecutionLookupError kind '${String(unreachable)}': add it to classifyFlowError.`
			);
		}
	}
}

/**
 * Single mapping of what flow-core throws on purpose. `unknown` means "not a flow-core error": the caller
 * should treat it as a bug. A flow-core error without its own category is `internal` (message still actionable).
 */
export function classifyFlowError(err: unknown): FlowErrorCategory {
	if (err instanceof InvalidQueryError) {
		return 'invalid-request';
	}
	if (err instanceof UnknownPluginError) {
		return 'not-found';
	}
	if (err instanceof ExecutionLookupError) {
		return classifyLookup(err.kind);
	}
	if (err instanceof WorkerListError) {
		return 'upstream-failure';
	}
	if (err instanceof FlowDefinitionError) {
		// The flow file a run names is gone (typically a deleted .flow/.tmp flow) or cannot be read as a flow.
		return err.kind === 'flow-file-missing' ? 'not-found' : 'unreadable-data';
	}
	if (err instanceof FlowCoreError) {
		if (err.kind === 'flow-not-found') return 'not-found';
		if (err.kind === 'invalid-flow-graph') return 'unreadable-data';
		return 'internal';
	}
	return 'unknown';
}

/**
 * The HTTP status the app modules answer with. An upstream failure is a gateway-style 502 (the daemon answered,
 * not with what was expected); internal and unknown errors are 500 (the caller tells them apart with
 * classifyFlowError: only an internal one has a message meant for the user).
 */
export function httpStatusOfFlowError(err: unknown): number {
	const category = classifyFlowError(err);
	switch (category) {
		case 'invalid-request':
			return 400;
		case 'not-found':
			return 404;
		case 'conflict':
			return 409;
		case 'unreadable-data':
			return 422;
		case 'upstream-failure':
			return 502;
		case 'internal':
		case 'unknown':
			return 500;
		default: {
			const unreachable: never = category;
			throw new Error(`Unmapped FlowErrorCategory '${String(unreachable)}': add it to httpStatusOfFlowError.`);
		}
	}
}

export interface HttpErrorAnswer {
	status: number;
	body: { error: string };
}

/**
 * The complete HTTP answer for a failure: status from {@link httpStatusOfFlowError} and an actionable message.
 * flow-core errors carry messages meant for the user, so they are passed through; anything else is a bug
 * and is labelled so rather than shown as if it were the user's mistake.
 */
export function httpAnswerOfFlowError(err: unknown): HttpErrorAnswer {
	const status = httpStatusOfFlowError(err);
	const message = errorMessage(err);
	if (classifyFlowError(err) === 'unknown') {
		return { status, body: { error: `Unexpected error while serving the request: ${message}` } };
	}
	return { status, body: { error: message } };
}
