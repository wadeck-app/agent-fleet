import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SchemaValidator } from './SchemaValidator';
import { ValidationCode } from './ValidationTypes';
import { WorkerTypeDeprecation } from './WorkerTypeDeprecation';

function flow(flowWorkerType: unknown, stepWorkerType?: unknown): FlowDefinition {
	return {
		id: 'f',
		name: 'F',
		workerType: flowWorkerType,
		steps: [{ type: 'script', id: 's1', name: 'S1', script: 'echo', workerType: stepWorkerType }],
	} as unknown as FlowDefinition;
}

function warningsOf(definition: FlowDefinition): MockIssueCollector['issues'] {
	const collector = new MockIssueCollector();
	new WorkerTypeDeprecation(collector).validate(definition);
	return collector.issues;
}

describe('WorkerTypeDeprecation', () => {
	it('says nothing without workerType', () => {
		expect(warningsOf(flow(undefined))).toHaveLength(0);
	});

	it('warns once for a flow-level workerType: sandbox and shows the replacement', () => {
		const issues = warningsOf(flow('sandbox'));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			severity: 'warning',
			code: ValidationCode.WORKER_TYPE_DEPRECATED,
			location: { field: 'workerType' },
		});
		expect(issues[0]!.message).toContain('deprecated');
		expect(issues[0]!.suggestion).toContain('requires: [sandbox]');
		expect(issues[0]!.suggestion).toContain('profile:');
	});

	it('for another type, does not invent a replacement list', () => {
		const issues = warningsOf(flow('docker'));
		expect(issues[0]!.message).toContain('"docker"');
		expect(issues[0]!.suggestion).not.toContain('requires: [sandbox]');
		expect(issues[0]!.suggestion).toContain('requires:');
	});

	it('warns for a step-level workerType, located on the step, saying it is not read there', () => {
		const issues = warningsOf(flow(undefined, 'sandbox'));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			code: ValidationCode.WORKER_TYPE_DEPRECATED,
			location: { stepId: 's1', field: 'workerType' },
		});
		expect(issues[0]!.message).toContain('no effect');
		expect(issues[0]!.suggestion).toContain('requires: [sandbox]');
	});

	it('flow and step together give two warnings', () => {
		expect(warningsOf(flow('sandbox', 'sandbox'))).toHaveLength(2);
	});

	it('a non-string workerType is left to the type error of the schema validator (no warning)', () => {
		expect(warningsOf(flow(3))).toHaveLength(0);
	});

	it('SchemaValidator reports it alongside the existing checks', () => {
		const collector = new MockIssueCollector();
		new SchemaValidator(collector).validateSchema(flow('sandbox'));
		expect(collector.issues.filter(i => i.code === ValidationCode.WORKER_TYPE_DEPRECATED)).toHaveLength(1);
	});
});
