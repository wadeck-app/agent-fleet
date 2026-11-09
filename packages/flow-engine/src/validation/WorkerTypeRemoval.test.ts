import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { FlowValidator } from './FlowValidator';
import { SchemaValidator } from './SchemaValidator';
import { ValidationCode } from './ValidationTypes';
import { WorkerTypeRemoval } from './WorkerTypeRemoval';

function flow(flowWorkerType: unknown, stepWorkerType?: unknown): FlowDefinition {
	return {
		id: 'f',
		name: 'F',
		workerType: flowWorkerType,
		steps: [{ type: 'script', id: 's1', name: 'S1', script: 'echo', workerType: stepWorkerType }],
	} as unknown as FlowDefinition;
}

function issuesOf(definition: FlowDefinition): MockIssueCollector['issues'] {
	const collector = new MockIssueCollector();
	new WorkerTypeRemoval(collector).validate(definition);
	return collector.issues;
}

describe('WorkerTypeRemoval', () => {
	it('says nothing without workerType', () => {
		expect(issuesOf(flow(undefined))).toHaveLength(0);
	});

	it('refuses a flow-level workerType: sandbox with the exact replacement', () => {
		const issues = issuesOf(flow('sandbox'));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.WORKER_TYPE_REMOVED,
			location: { field: 'workerType' },
		});
		// `flow validate` prints the message only, so the whole migration is in it.
		expect(issues[0]!.message).toBe(
			"Flow 'f': workerType was removed: write requires: [sandbox] (any worker whose source guarantees it) or profile: <name> (agent, inspect, untrusted-code, hermetic-test); see 'flow worker source list' for the guarantees your sources declare (it is set to \"sandbox\")"
		);
		expect(issues[0]!.suggestion).toContain('requires: [sandbox]');
	});

	it('for another type, does not invent a replacement list', () => {
		const issues = issuesOf(flow('docker'));
		expect(issues[0]!.message).toContain('"docker"');
		expect(issues[0]!.message).not.toContain('requires: [sandbox]');
		expect(issues[0]!.message).toContain('requires: [<guarantee>');
		expect(issues[0]!.message).toContain('flow worker source list');
	});

	it('refuses a step-level workerType too, located on the step', () => {
		const issues = issuesOf(flow(undefined, 'sandbox'));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.WORKER_TYPE_REMOVED,
			location: { stepId: 's1', field: 'workerType' },
		});
	});

	it('flow and step together give two errors', () => {
		expect(issuesOf(flow('sandbox', 'sandbox'))).toHaveLength(2);
	});

	it('refuses a workerType that is not a string as well, with the generic replacement', () => {
		const issues = issuesOf(flow(3));
		expect(issues).toHaveLength(1);
		expect(issues[0]!.message).toContain('requires: [<guarantee>');
	});

	it('SchemaValidator reports it, and the flow is invalid', () => {
		const collector = new MockIssueCollector();
		new SchemaValidator(collector).validateSchema(flow('sandbox'));
		expect(collector.issues.filter(i => i.code === ValidationCode.WORKER_TYPE_REMOVED)).toHaveLength(1);
		expect(new FlowValidator().validate(flow('sandbox')).valid).toBe(false);
	});
});
