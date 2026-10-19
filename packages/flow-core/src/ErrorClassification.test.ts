import { describe, expect, it } from 'vitest';

import { classifyFlowError, httpAnswerOfFlowError, httpStatusOfFlowError } from './ErrorClassification.js';
import { FlowCoreError, InvalidQueryError } from './errors.js';
import { FlowDefinitionError } from './graph/FlowDefinitionLoader.js';
import { UnknownPluginError } from './plugins/PluginCatalog.js';
import { ExecutionLookupError } from './show/ExecutionDetail.js';
import { WorkerListError } from './worker/WorkerList.js';

describe('classifyFlowError', () => {
	it.each([
		[new InvalidQueryError('x'), 'invalid-request'],
		[new ExecutionLookupError('x', 'invalid-id'), 'invalid-request'],
		[new ExecutionLookupError('x', 'not-found'), 'not-found'],
		[new UnknownPluginError('p'), 'not-found'],
		[new ExecutionLookupError('x', 'ambiguous'), 'conflict'],
		[new ExecutionLookupError('x', 'corrupt'), 'unreadable-data'],
		[new ExecutionLookupError('x', 'invalid-record'), 'unreadable-data'],
		[new WorkerListError('x', 'daemon-outdated'), 'upstream-failure'],
		[new WorkerListError('x', 'daemon-error'), 'upstream-failure'],
		[new FlowDefinitionError('x', 'flow-file-missing'), 'not-found'],
		[new FlowDefinitionError('x', 'flow-file-unreadable'), 'unreadable-data'],
		[new FlowDefinitionError('x', 'flow-file-invalid'), 'unreadable-data'],
		[new FlowCoreError('x', 'flow-not-found'), 'not-found'],
		[new FlowCoreError('x', 'invalid-flow-graph'), 'unreadable-data'],
	] as const)('%s -> %s', (error, expected) => {
		expect(classifyFlowError(error)).toBe(expected);
	});

	it('treats other flow-core errors as internal but keeps them recognisable', () => {
		expect(classifyFlowError(new FlowCoreError('x', 'not-configured'))).toBe('internal');
	});

	it('returns unknown for anything that is not a flow-core error', () => {
		expect(classifyFlowError(new Error('boom'))).toBe('unknown');
		expect(classifyFlowError('text')).toBe('unknown');
	});
});

describe('httpStatusOfFlowError', () => {
	it.each([
		[new InvalidQueryError('x'), 400],
		[new ExecutionLookupError('x', 'not-found'), 404],
		[new ExecutionLookupError('x', 'ambiguous'), 409],
		[new FlowDefinitionError('x', 'flow-file-invalid'), 422],
		[new WorkerListError('x', 'daemon-error'), 502],
		[new FlowCoreError('x', 'not-configured'), 500],
		[new Error('boom'), 500],
	] as const)('%s -> %i', (error, expected) => {
		expect(httpStatusOfFlowError(error)).toBe(expected);
	});
});

describe('httpAnswerOfFlowError', () => {
	it('passes the message of a flow-core error through with its status', () => {
		expect(httpAnswerOfFlowError(new InvalidQueryError('Invalid limit'))).toEqual({
			status: 400,
			body: { error: 'Invalid limit' },
		});
	});

	it('labels an unexpected error so it is not mistaken for a user mistake', () => {
		expect(httpAnswerOfFlowError(new Error('disk on fire'))).toEqual({
			status: 500,
			body: { error: 'Unexpected error while serving the request: disk on fire' },
		});
	});

	it('keeps the message of an internal flow-core error as is', () => {
		expect(httpAnswerOfFlowError(new FlowCoreError('no manifests', 'not-configured'))).toEqual({
			status: 500,
			body: { error: 'no manifests' },
		});
	});
});
