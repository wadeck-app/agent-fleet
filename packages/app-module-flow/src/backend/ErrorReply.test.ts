import { ExecutionLookupError, InvalidQueryError, UnknownPluginError, WorkerListError } from 'flow-core';
import { asReply, fakeReply, replied } from 'flow-core/testing';
import { describe, expect, it } from 'vitest';

import { replyWithError } from './ErrorReply.js';

function statusAndBody(err: unknown): { status: number; body: unknown } {
	const reply = fakeReply();
	replyWithError(asReply<Parameters<typeof replyWithError>[0]>(reply), err);
	return replied(reply);
}

describe('replyWithError', () => {
	it.each([
		['invalid query', new InvalidQueryError('bad limit'), 400],
		['invalid execution id', new ExecutionLookupError('not an id', 'invalid-id'), 400],
		['execution not found', new ExecutionLookupError('none', 'not-found'), 404],
		['unknown plugin', new UnknownPluginError('nope'), 404],
		['ambiguous prefix', new ExecutionLookupError('two match', 'ambiguous'), 409],
		['corrupt execution file', new ExecutionLookupError('cannot parse', 'corrupt'), 422],
		['invalid execution record', new ExecutionLookupError('no steps', 'invalid-record'), 422],
		['daemon too old for the command', new WorkerListError('daemon outdated', 'daemon-outdated'), 502],
		['daemon refused the worker list', new WorkerListError('daemon said no', 'daemon-error'), 502],
	])('maps %s to its HTTP status with the error message', (_label, err, status) => {
		expect(statusAndBody(err)).toEqual({ status, body: { error: err.message } });
	});

	it('answers 500 with the message of an unexpected Error and says it is unexpected', () => {
		const { status, body } = statusAndBody(new Error('disk on fire'));
		expect(status).toBe(500);
		expect(body).toEqual({ error: 'Unexpected error while serving the request: disk on fire' });
	});

	it('answers 500 for a thrown non-Error value', () => {
		expect(statusAndBody('boom').body).toEqual({ error: 'Unexpected error while serving the request: boom' });
	});
});
