import { DefinitionSnapshotStore } from '../definitions/DefinitionSnapshotStore.js';
import { FlowCoreError } from '../errors.js';
import type { ExecutionState } from '../execution/ExecutionState.js';
import { FlowDefinitionError, loadFlowDefinition, parseFlowDefinition } from '../graph/FlowDefinitionLoader.js';
import { type StepRetryPolicy, retryPoliciesOf } from './RetryBadge.js';

/**
 * The retry budget of each step of a flow file, or undefined when the file cannot give it (deleted: flows generated
 * for a single run are removed afterwards; or not a flow). The caller shows that as "retry policy unknown", never as
 * an exhausted budget. Anything else than a FlowDefinitionError is a bug and propagates.
 */
export function readRetryPolicies(flowFile: string): Record<string, StepRetryPolicy> | undefined {
	try {
		return retryPoliciesOf(loadFlowDefinition(flowFile));
	} catch (err) {
		if (err instanceof FlowDefinitionError) {
			return undefined;
		}
		throw err;
	}
}

/**
 * The retry budgets of the definition a run actually used: its recorded snapshot when it has one (the flow file may
 * have been edited since), the flow file for a record written before versions existed. A snapshot that cannot be read
 * gives undefined ("retry policy unknown"); it never falls back to the current file, which could show another policy.
 */
export function readRecordedRetryPolicies(
	record: Pick<ExecutionState, 'flowFile' | 'definitionSnapshot'>,
	definitionsDir: string
): Record<string, StepRetryPolicy> | undefined {
	if (record.definitionSnapshot === undefined) {
		return readRetryPolicies(record.flowFile);
	}
	try {
		const text = new DefinitionSnapshotStore(definitionsDir).read(record.definitionSnapshot);
		return retryPoliciesOf(parseFlowDefinition(text, record.definitionSnapshot));
	} catch (err) {
		if (err instanceof FlowDefinitionError || err instanceof FlowCoreError) {
			return undefined;
		}
		throw err;
	}
}
