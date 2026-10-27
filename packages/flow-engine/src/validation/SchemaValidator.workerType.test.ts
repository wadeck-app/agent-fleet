/**
 * Flow-level `workerType`: binds every step of the run to the workers of one worker type. The shape is checked
 * here; whether the type exists is only known to a host that knows the declared worker sources (the daemon).
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SchemaValidator } from './SchemaValidator';
import { ValidationCode } from './ValidationTypes';

let collector: MockIssueCollector;

beforeEach(() => {
	collector = new MockIssueCollector();
});

function flowWithWorkerType(workerType: unknown): FlowDefinition {
	const flow = {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
		inputs: {},
		steps: [{ type: 'script', id: 's1', name: 'S1', script: 'echo hi' }],
	} as Record<string, unknown>;
	if (workerType !== undefined) {
		flow['workerType'] = workerType;
	}
	return flow as unknown as FlowDefinition;
}

function workerTypeIssues() {
	return collector.issues.filter(i => i.location?.field === 'workerType');
}

describe('SchemaValidator - flow-level workerType shape', () => {
	it('accepts a plain name', () => {
		new SchemaValidator(collector).validateSchema(flowWithWorkerType('sandbox'));
		expect(workerTypeIssues()).toHaveLength(0);
	});

	it('accepts an omitted field', () => {
		new SchemaValidator(collector).validateSchema(flowWithWorkerType(undefined));
		expect(workerTypeIssues()).toHaveLength(0);
	});

	it.each([42, true, ['sandbox'], { name: 'sandbox' }, null])('rejects %j, which is not a string', value => {
		new SchemaValidator(collector).validateSchema(flowWithWorkerType(value));

		const [issue] = workerTypeIssues();
		expect(issue?.severity).toBe('error');
		expect(issue?.code).toBe(ValidationCode.INVALID_TYPE);
		expect(issue?.suggestion).toContain('workerType: sandbox');
	});

	it.each(['', '   ', 'sand box', 'sandbox.docker', 'a/b'])('rejects %j, which is not a plain name', value => {
		new SchemaValidator(collector).validateSchema(flowWithWorkerType(value));

		const [issue] = workerTypeIssues();
		expect(issue?.severity).toBe('error');
		expect(issue?.code).toBe(ValidationCode.INVALID_VALUE);
		expect(issue?.suggestion).toContain('letters, digits');
	});
});

describe('SchemaValidator - flow-level workerType against the known worker types', () => {
	it('accepts a type the host knows', () => {
		new SchemaValidator(collector, [], ['gpu', 'sandbox']).validateSchema(flowWithWorkerType('sandbox'));
		expect(workerTypeIssues()).toHaveLength(0);
	});

	it('rejects an unknown type and lists the known ones', () => {
		new SchemaValidator(collector, [], ['gpu', 'sandbox']).validateSchema(flowWithWorkerType('sandbx'));

		const [issue] = workerTypeIssues();
		expect(issue?.severity).toBe('error');
		expect(issue?.code).toBe(ValidationCode.INVALID_VALUE);
		expect(issue?.message).toContain('"sandbx"');
		expect(issue?.message).toContain('Known worker types: gpu, sandbox');
		expect(issue?.suggestion).toContain('flow worker source list');
	});

	it('says that no type is declared at all when the host knows none', () => {
		new SchemaValidator(collector, [], []).validateSchema(flowWithWorkerType('sandbox'));

		const [issue] = workerTypeIssues();
		expect(issue?.message).toContain('no worker type is declared');
		expect(issue?.suggestion).toContain('flow worker source add');
	});

	// The engine alone (editor, registry) cannot know the declared sources: it must not invent a verdict.
	it('does not check the name against anything when the host gave no list', () => {
		new SchemaValidator(collector).validateSchema(flowWithWorkerType('whatever'));
		expect(workerTypeIssues()).toHaveLength(0);
	});
});
