import type { FlowDefinition, FlowStep } from 'flow-engine/types';

import type { RunRequirementsRecord } from '../execution/ExecutionState.js';

/** Expands a profile name to its requirements; undefined for a name it does not know. */
export type ProfileExpander = (name: string) => readonly string[] | undefined;

const CONTINUATION = '           ';
const IMPLICIT_NOTE = '(implicit for model steps)';

/**
 * Header lines of `flow show <file>` about requirements: the flow-level profile and `requires`, then what each profile in
 * use stands for. Nothing for a flow that declares none. Without `expand` (flow-core does not know the catalog) only the
 * names are shown.
 */
export function flowRequirementLines(flow: FlowDefinition, expand?: ProfileExpander): string[] {
	const lines: string[] = [];
	if (flow.profile !== undefined) {
		lines.push(`profile:   ${String(flow.profile)}`);
	}
	if (Array.isArray(flow.requires) && flow.requires.length > 0) {
		lines.push(`requires:  ${flow.requires.join(', ')}`);
	}
	if (expand === undefined) {
		return lines;
	}
	const used = new Set<string>();
	for (const profile of [flow.profile, ...(flow.steps ?? []).map(step => step.profile)]) {
		if (typeof profile === 'string') {
			used.add(profile);
		}
	}
	[...used].sort().forEach((name, index) => {
		const expanded = expand(name);
		const prefix = index === 0 ? 'expands:   ' : CONTINUATION;
		lines.push(
			`${prefix}${name} = ${expanded === undefined ? '(unknown profile: run flow validate)' : expanded.join(', ')}`
		);
	});
	return lines;
}

/**
 * Suffix of a step row in `flow show <file>`: its own profile and requires (the flow-level ones are in the header), then
 * `host:true` for a script that asks to run on the worker's own machine (nothing for `host: false`, the default).
 */
export function stepRequirementSuffix(step: FlowStep): string {
	const profile = step.profile === undefined ? '' : `  profile:${String(step.profile)}`;
	const requires =
		Array.isArray(step.requires) && step.requires.length > 0 ? `  requires:${step.requires.join(',')}` : '';
	const host = step.type === 'script' && step.host === true ? '  host:true' : '';
	return `${profile}${requires}${host}`;
}

/** `Profile:` and `Requires:` lines of `flow show <execution>`: the profile name and the run set that is enforced. */
export function executionRequirementLines(recorded: RunRequirementsRecord | undefined): string[] {
	if (recorded === undefined) {
		return [];
	}
	const lines: string[] = [];
	if (recorded.profiles?.run !== undefined) {
		lines.push(`Profile:   ${recorded.profiles.run}`);
	}
	if (recorded.run.length > 0) {
		lines.push(`Requires:  ${recorded.run.join(', ')}`);
	}
	// Only when a declared step received it: a record that only carries the set for steps injected later shows as before.
	if (recorded.implicit !== undefined && recorded.implicit.requires.length > 0 && recorded.implicit.steps.length > 0) {
		lines.push(`Requires:  ${recorded.implicit.requires.join(', ')} ${IMPLICIT_NOTE}`);
	}
	return lines;
}

/** Lines under a step of `flow show <execution>`: its profile and its enforced set, when they differ from the run's. */
export function stepRecordedRequirementLines(
	recorded: RunRequirementsRecord | undefined,
	stepId: string,
	indent: string
): string[] {
	const set = recorded?.steps[stepId];
	if (recorded === undefined || set === undefined) {
		return [];
	}
	const lines: string[] = [];
	const profile = recorded.profiles?.steps[stepId];
	if (profile !== undefined) {
		lines.push(`${indent}profile: ${profile}`);
	}
	if (set.join('\n') !== recorded.run.join('\n')) {
		const implicit = recorded.implicit?.steps.includes(stepId) === true ? ` ${IMPLICIT_NOTE}` : '';
		lines.push(`${indent}requires: ${set.join(', ')}${implicit}`);
	}
	return lines;
}
