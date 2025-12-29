/**
 * Test Mocks
 *
 * Reusable mock classes and objects for testing.
 */
import type { FlowRegistry } from 'flow-engine/registry/FlowRegistry';
import type { FlowDefinition } from 'flow-engine/types';
import type { IssueCollector, ValidationCode, ValidationIssue } from 'flow-engine/validation/ValidationTypes';

// import type { FlowRegistry } from 'flow-engine/registry/FlowRegistry';
// import type { FlowDefinition } from 'flow-engine/types';
// import type { IssueCollector, ValidationCode, ValidationIssue } from 'flow-engine/validation/ValidationTypes';

/**
 * Mock IssueCollector for validation testing
 */
export class MockIssueCollector implements IssueCollector {
	public issues: ValidationIssue[] = [];

	addIssue(issue: ValidationIssue): void {
		this.issues.push(issue);
	}

	reset(): void {
		this.issues = [];
	}

	getErrors(): ValidationIssue[] {
		return this.issues.filter(i => i.severity === 'error');
	}

	getWarnings(): ValidationIssue[] {
		return this.issues.filter(i => i.severity === 'warning');
	}

	hasCode(code: ValidationCode): boolean {
		return this.issues.some(i => i.code === code);
	}

	getIssueByCode(code: ValidationCode): ValidationIssue | undefined {
		return this.issues.find(i => i.code === code);
	}

	hasError(): boolean {
		return this.getErrors().length > 0;
	}

	hasWarning(): boolean {
		return this.getWarnings().length > 0;
	}
}

/**
 * Mock FlowRegistry for testing
 */
export class MockFlowRegistry implements Pick<FlowRegistry, 'getFlow' | 'hasFlow'> {
	private flows: Map<string, FlowDefinition> = new Map();

	addFlow(flow: FlowDefinition): void {
		this.flows.set(flow.id, flow);
	}

	getFlow(id: string): FlowDefinition | undefined {
		return this.flows.get(id);
	}

	hasFlow(id: string): boolean {
		return this.flows.has(id);
	}

	clear(): void {
		this.flows.clear();
	}

	getAllFlows(): FlowDefinition[] {
		return Array.from(this.flows.values());
	}
}
