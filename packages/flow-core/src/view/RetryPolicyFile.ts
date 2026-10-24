import { FlowDefinitionError, loadFlowDefinition } from '../graph/FlowDefinitionLoader.js';
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
