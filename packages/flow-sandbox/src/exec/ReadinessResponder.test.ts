import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import type { JsonObject } from '../harness/HarnessMessages';
import { RecordingSandboxLog } from '../testing/RecordingSandboxLog';
import type { ReadinessAnswer } from './ProfileReadinessCheck';
import { ReadinessResponder } from './ReadinessResponder';

type CheckRequest = { tool?: string };

class Harness {
	readonly sent: JsonObject[] = [];
	readonly checks: CheckRequest[] = [];
	readonly log = new RecordingSandboxLog();
	/** Order of events: `send:<type>` and `check`. */
	readonly events: string[] = [];
	check: (request: CheckRequest) => Promise<ReadinessAnswer> = () => Promise.resolve({ ready: true });
	failSend = false;
	readonly responder = new ReadinessResponder({
		check: {
			check: request => {
				this.events.push('check');
				this.checks.push(request);
				return this.check(request);
			},
		},
		send: message => {
			this.events.push(`send:${String(message['type'])}`);
			if (this.failSend) throw new Error('connection closed');
			this.sent.push(message);
		},
		log: this.log,
	});
}

const request = (overrides: JsonObject = {}): JsonObject => ({
	type: 'readiness_request',
	requestId: 'r1',
	executionId: 'e1',
	stepId: 's1',
	tool: 'claude',
	...overrides,
});

describe('ReadinessResponder', () => {
	it('sends the ack synchronously, before the check is even called, then the verdict', async () => {
		const h = new Harness();

		const done = h.responder.handle(request());
		// Synchronously: the ack is already out when handle() returns its promise, and it precedes the check.
		expect(h.events.slice(0, 2)).toEqual(['send:readiness_alive', 'check']);
		await done;

		expect(h.events).toEqual(['send:readiness_alive', 'check', 'send:readiness_answer']);
		expect(h.sent).toEqual([
			{ type: 'readiness_alive', requestId: 'r1' },
			{ type: 'readiness_answer', requestId: 'r1', result: 'ready' },
		]);
		expect(h.checks).toEqual([{ tool: 'claude' }]);
	});

	it('maps a refusal to not_ready with reason, message and retryAfter (a number)', async () => {
		const h = new Harness();
		h.check = () =>
			Promise.resolve({
				ready: false,
				reason: 'sso-expired',
				message: 'Run aws sso login',
				retryAfterSeconds: 30,
			});

		await h.responder.handle(request());

		expect(h.sent[1]).toEqual({
			type: 'readiness_answer',
			requestId: 'r1',
			result: 'not_ready',
			reason: 'sso-expired',
			message: 'Run aws sso login',
			retryAfter: 30,
		});
	});

	it('answers a script step (no tool) with ack and ready, the check being asked without a tool', async () => {
		const h = new Harness();

		await h.responder.handle(request({ tool: undefined }));

		expect(h.sent.map(message => message['type'])).toEqual(['readiness_alive', 'readiness_answer']);
		expect(h.sent[1]).toMatchObject({ result: 'ready' });
		expect(h.checks).toEqual([{}]);
	});

	it('answers ready, with a warning, when the tool has no alias (the early alias check fails the step)', async () => {
		const h = new Harness();
		h.check = () => Promise.reject(new SandboxError('invalid-options', 'No profile for tool codex'));

		await h.responder.handle(request({ tool: 'codex' }));

		expect(h.sent[1]).toMatchObject({ result: 'ready' });
		expect(h.log.text()).toContain('warn:');
		expect(h.log.text()).toContain('No profile for tool codex');
	});

	it('answers not_ready readiness-check-failed with the message (no stack) on an unexpected error', async () => {
		const h = new Harness();
		h.check = () => Promise.reject(new Error('boom'));

		await h.responder.handle(request());

		expect(h.sent[1]).toMatchObject({
			result: 'not_ready',
			reason: 'readiness-check-failed',
			message: 'boom',
			retryAfter: 30,
		});
		expect(JSON.stringify(h.sent)).not.toContain('at ');
		expect(h.log.text()).toContain('boom');
	});

	it('answers not_ready invalid-readiness-request when the shape is wrong but a requestId exists', async () => {
		for (const bad of [{ executionId: 1 }, { stepId: undefined }, { tool: 'gpt' }, { tool: 3 }]) {
			const h = new Harness();

			await h.responder.handle(request(bad));

			expect(h.sent[0]).toEqual({ type: 'readiness_alive', requestId: 'r1' });
			expect(h.sent[1]).toMatchObject({ result: 'not_ready', reason: 'invalid-readiness-request' });
			expect(h.checks).toEqual([]);
			expect(h.log.text()).toContain('warn:');
		}
	});

	it('only warns when there is no usable requestId', async () => {
		for (const bad of [{ requestId: undefined }, { requestId: '' }, { requestId: 4 }]) {
			const h = new Harness();

			await h.responder.handle(request(bad));

			expect(h.sent).toEqual([]);
			expect(h.log.text()).toContain('warn:');
		}
	});

	it('sends the ack even when the check never resolves', async () => {
		const h = new Harness();
		h.check = () => new Promise<ReadinessAnswer>(() => undefined);

		void h.responder.handle(request());
		await Promise.resolve();

		expect(h.sent).toEqual([{ type: 'readiness_alive', requestId: 'r1' }]);
	});

	it('answers two overlapping requests independently, each with its own requestId', async () => {
		const h = new Harness();
		const releases: Array<(answer: ReadinessAnswer) => void> = [];
		h.check = () => new Promise<ReadinessAnswer>(resolve => releases.push(resolve));

		const first = h.responder.handle(request({ requestId: 'a' }));
		const second = h.responder.handle(request({ requestId: 'b' }));
		releases[1]?.({ ready: false, reason: 'sso-expired', message: 'm', retryAfterSeconds: 30 });
		await second;
		releases[0]?.({ ready: true });
		await first;

		const answers = h.sent.filter(message => message['type'] === 'readiness_answer');
		expect(answers).toEqual([
			{
				type: 'readiness_answer',
				requestId: 'b',
				result: 'not_ready',
				reason: 'sso-expired',
				message: 'm',
				retryAfter: 30,
			},
			{ type: 'readiness_answer', requestId: 'a', result: 'ready' },
		]);
		expect(h.sent.filter(message => message['type'] === 'readiness_alive')).toHaveLength(2);
	});

	it('logs a send failure once and never rejects', async () => {
		const h = new Harness();
		h.failSend = true;

		await expect(h.responder.handle(request())).resolves.toBeUndefined();
		await expect(h.responder.handle(request({ requestId: 'r2' }))).resolves.toBeUndefined();

		const lines = h.log.lines.filter(line => line.includes('could not send a readiness message'));
		expect(lines).toHaveLength(1);
	});
});
