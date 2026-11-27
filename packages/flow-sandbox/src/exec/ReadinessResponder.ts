import { describeError } from '../ErrorText';
import { type ModelTool, requireModelTool } from '../ModelTool';
import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import type { JsonObject } from '../harness/HarnessMessages';
import type { ProfileReadinessCheck } from './ProfileReadinessCheck';

/**
 * The `readiness` protocol of the flow daemon (flow-cli `Protocol.ts`: `WORKER_FEATURE_READINESS`, messages
 * `readiness_request`, `readiness_alive`, `readiness_answer`). This branch's copy of flow-cli predates it, so the
 * value is declared here; replace it with the import once flow-cli on this branch has it.
 */
export const WORKER_FEATURE_READINESS = 'readiness';

export interface ReadinessResponderOptions {
	check: Pick<ProfileReadinessCheck, 'check'>;
	send: (message: JsonObject) => void;
	log: SandboxLog;
}

/**
 * Answers the daemon's "are you ready for this step?" (`readiness_request`): `readiness_alive` at once (before any
 * check), then `readiness_answer` with the same requestId. The question is ALWAYS answered, whatever the check does:
 * - a tool without alias is answered `ready` (the step then reaches the wrapper, whose early alias check fails it
 *   at once with the actionable text), logged as a warning;
 * - any other error of the check is `not_ready` / `readiness-check-failed` with the error's message (never a stack);
 * - an invalid request is `not_ready` / `invalid-readiness-request` when it carries a requestId, else only a warning.
 * Requests are independent (no shared state). A failing `send` (connection closed) is logged once.
 */
export class ReadinessResponder {
	static readonly INVALID_REASON = 'invalid-readiness-request';
	static readonly CHECK_FAILED_REASON = 'readiness-check-failed';
	/** The daemon waits for a retry this long (seconds) after a not-ready answer caused by the wrapper itself. */
	private static readonly RETRY_AFTER_SECONDS = 30;

	private sendFailureLogged = false;

	constructor(private readonly options: ReadinessResponderOptions) {}

	/** Never rejects. The ack is sent synchronously, before the first await. */
	async handle(message: JsonObject): Promise<void> {
		try {
			await this.answer(message);
		} catch (error) {
			// Last resort: a bug in this class must not become an unhandled rejection.
			this.options.log.warn(`readiness request handling failed unexpectedly: ${describeError(error)}`);
		}
	}

	private async answer(message: JsonObject): Promise<void> {
		const requestId = message['requestId'];
		const requestIdText = typeof requestId === 'string' && requestId !== '' ? requestId : undefined;
		// First, before any validation detail or check: the daemon waits for it (3 s).
		if (requestIdText !== undefined) this.safeSend({ type: 'readiness_alive', requestId: requestIdText });
		const invalid = this.invalidity(message);
		if (invalid !== undefined || requestIdText === undefined) {
			this.options.log.warn(`invalid readiness_request: ${invalid}.`);
			if (requestIdText !== undefined) {
				this.notReady(
					requestIdText,
					ReadinessResponder.INVALID_REASON,
					`The wrapper could not read the readiness request: ${invalid}.`,
					ReadinessResponder.RETRY_AFTER_SECONDS
				);
			}
			return;
		}
		const id = requestIdText;
		const tool = typeof message['tool'] === 'string' ? requireModelTool(message['tool']) : undefined;
		try {
			const result = await this.options.check.check(tool === undefined ? {} : { tool });
			if (result.ready) {
				this.safeSend({ type: 'readiness_answer', requestId: id, result: 'ready' });
			} else {
				this.notReady(id, result.reason, result.message, result.retryAfterSeconds);
			}
		} catch (error) {
			if (error instanceof SandboxError) {
				this.options.log.warn(
					`readiness check of tool "${String(message['tool'])}" could not run (${describeError(error)}); answered ready, the step will fail at once with this reason.`
				);
				this.safeSend({ type: 'readiness_answer', requestId: id, result: 'ready' });
				return;
			}
			this.options.log.warn(`readiness check failed unexpectedly: ${describeError(error)}`);
			this.notReady(
				id,
				ReadinessResponder.CHECK_FAILED_REASON,
				describeError(error),
				ReadinessResponder.RETRY_AFTER_SECONDS
			);
		}
	}

	/** Shape problem of the request (text), or undefined.  */
	private invalidity(message: JsonObject): string | undefined {
		const requestId = message['requestId'];
		if (typeof requestId !== 'string' || requestId === '') return 'requestId is missing or not a non-empty string';
		if (typeof message['executionId'] !== 'string') return 'executionId is missing or not a string';
		if (typeof message['stepId'] !== 'string') return 'stepId is missing or not a string';
		const tool = message['tool'];
		if (tool !== undefined) {
			if (typeof tool !== 'string') return 'tool is not a string';
			try {
				requireModelTool(tool);
			} catch (error) {
				return describeError(error).replace(/\.$/, '');
			}
		}
		return undefined;
	}

	private notReady(requestId: string, reason: string, text: string, retryAfter: number): void {
		this.safeSend({ type: 'readiness_answer', requestId, result: 'not_ready', reason, message: text, retryAfter });
	}

	private safeSend(message: JsonObject): void {
		try {
			this.options.send(message);
		} catch (error) {
			if (this.sendFailureLogged) return;
			this.sendFailureLogged = true;
			this.options.log.warn(
				`could not send a readiness message to the daemon (${describeError(error)}); further failures are not reported.`
			);
		}
	}
}
