import type { ModuleRouteHandler } from '@wadeck-app/app-core-sdk';
import { httpAnswerOfFlowError } from 'flow-core';

type Reply = Parameters<ModuleRouteHandler>[1];

/**
 * Hands what flow-core threw to the app-core reply. The error -> status/message decision lives in flow-core
 * (httpAnswerOfFlowError); only the adapter to the SDK's reply type is here, because flow-core knows no SDK.
 */
export function replyWithError(reply: Reply, err: unknown): void {
	const { status, body } = httpAnswerOfFlowError(err);
	reply.code(status).send(body);
}
