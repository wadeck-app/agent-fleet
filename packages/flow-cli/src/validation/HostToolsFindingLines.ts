import { type HostToolsConfinementPolicy, HostToolsConfinementValidator } from 'flow-engine';
import type { ValidationIssue } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/types';

/**
 * The `HOST_TOOL_UNDER_CONFINED_PROFILE` finding as lines for `flow show <file>`, with the mode that applied (the same text
 * `flow validate` prints). Like `flow validate`, it cannot know the implicit confinement a daemon adds: that is reported at `flow run`.
 */
export class HostToolsFindingLines {
	/**
	 * @param policy read only when a model step declares hostTools, so a broken user configuration cannot break `flow show` of an
	 *        unrelated flow; its error (invalid setting) is not caught: it names the key, the value and the accepted ones.
	 */
	static of(flow: FlowDefinition, policy: () => HostToolsConfinementPolicy): string[] {
		const declares = (flow.steps ?? []).some(
			step => step.type === 'model' && (step as { hostTools?: unknown }).hostTools !== undefined
		);
		if (!declares) {
			return [];
		}
		const issues: ValidationIssue[] = [];
		new HostToolsConfinementValidator({ addIssue: issue => issues.push(issue) }, policy()).validateFlow(flow);
		return issues.map(issue => `${issue.severity}: ${issue.message}`);
	}
}
