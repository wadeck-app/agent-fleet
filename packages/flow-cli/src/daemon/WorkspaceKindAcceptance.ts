import type { RunRequirementsRecord } from 'flow-core';

import type { DeclaredGuarantees } from './DeclaredGuarantees.js';

/**
 * Run-start check of the workspace kinds the worker sources accept (`workspaces` in the plugin manifest).
 *
 * For each requirement set of the run (the flow's, then each step's), S is the declared sources whose static guarantees
 * cover the whole set. S empty: nothing to say here (the placement reports "no source provides it", with its own
 * message). S non-empty and EVERY source of S restricts its workspaces to kinds that do not include the flow's: the run
 * is refused, because any source of S may serve it but none accepts its workspace. One accepting source (or one with no
 * restriction) is enough.
 *
 * It reads the static manifest declarations (the upper bound), not the built instances: refusing only when nobody CAN
 * accept is the safe direction, the placement filter narrows with the built instance. Offline validation cannot do this
 * (it has no source knowledge).
 */
export class WorkspaceKindAcceptance {
	constructor(private readonly declared: Pick<DeclaredGuarantees, 'providersOfAll' | 'workspacesOf'>) {}

	/**
	 * @param flowId the flow, for the message
	 * @param kind the provider kind of the flow's `workspace:`; undefined when it cannot be determined (then a restricted source never accepts)
	 * @param requirements what the run resolved to require (the record stored with the execution); undefined: nothing
	 * @returns undefined when the run may start, otherwise the refusal naming the flow, kind, requirement, sources, accepted kinds and the fix
	 */
	check(
		flowId: string,
		kind: string | undefined,
		requirements: RunRequirementsRecord | undefined
	): string | undefined {
		if (requirements === undefined) {
			return undefined;
		}
		const sets: { subject: string; required: string[] }[] = [
			{ subject: `Flow "${flowId}"`, required: requirements.run },
			...Object.entries(requirements.steps).map(([stepId, required]) => ({
				subject: `Step "${stepId}" of flow "${flowId}"`,
				required,
			})),
		];
		const seen = new Set<string>();
		for (const { subject, required } of sets) {
			const signature = JSON.stringify(required);
			if (required.length === 0 || seen.has(signature)) {
				continue;
			}
			seen.add(signature);
			const refusal = this.refusal(subject, required, flowId, kind);
			if (refusal !== undefined) {
				return refusal;
			}
		}
		return undefined;
	}

	private refusal(subject: string, required: string[], flowId: string, kind: string | undefined): string | undefined {
		const providers = this.declared.providersOfAll(required);
		const restricted = providers.map(sourceId => ({ sourceId, kinds: this.declared.workspacesOf(sourceId) }));
		const everyRefuses =
			restricted.length > 0 &&
			restricted.every(({ kinds }) => kinds !== undefined && (kind === undefined || !kinds.includes(kind)));
		if (!everyRefuses) {
			return undefined;
		}
		const accepted = [...new Set(restricted.flatMap(({ kinds }) => kinds ?? []))].sort();
		const sources = restricted.map(({ sourceId, kinds }) => `${sourceId} (${(kinds ?? []).join(', ')})`).join(', ');
		const declares =
			kind === undefined
				? `the workspace of flow "${flowId}" does not name a workspace kind the daemon can read`
				: `the flow declares workspace: ${kind}`;
		const fix =
			kind === undefined
				? `declare "workspace:" as one of ${accepted.join(', ')}`
				: `change "workspace:" to one of ${accepted.join(', ')}`;
		return (
			`${subject} requires ${required.join(', ')}, and the only sources that provide ${required.length === 1 ? 'it' : 'them'} ` +
			`accept other workspace kinds: ${sources}; but ${declares}. ` +
			`Fix: ${fix}, or remove the requirement. (Checked when the run starts; flow validate has no knowledge of the worker sources.)`
		);
	}
}
