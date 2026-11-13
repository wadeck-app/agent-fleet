import type { RunRequirementsRecord } from 'flow-core';

import type { DeclaredGuarantees } from './DeclaredGuarantees.js';

/**
 * Run-start check that a source SERVING THE PROJECT of the run can provide what the flow itself requires.
 *
 * For each requirement set the flow declared (its `requires:`/`profile:`, flow-level then each step's): when declared sources
 * guarantee the whole set but every one of them serves only other projects (their `projects` option), the run is refused,
 * because the step would only wait the bound and fail. A set no declared source guarantees is not this check's concern (the
 * existing "no declared source provides it" messages say it), and a source with no `projects` option serves every project.
 *
 * Never given the implicit set: a model step confined implicitly keeps routing as before, with a warning
 * (see `ImplicitConfinement`). While a declared source is unread nothing is refused: it may be the one that serves the project.
 */
export class ProjectRequirementCheck {
	constructor(
		private readonly declared: Pick<DeclaredGuarantees, 'providersOfAllForProject' | 'projectsOf' | 'unread'>
	) {}

	/**
	 * @param flowId the flow, for the message
	 * @param projectId the registry id of the project of the run
	 * @param requirements what the flow ITSELF requires (resolved without the implicit set); undefined: nothing
	 * @returns undefined when the run may start, otherwise the refusal naming the requirements (and profile), the project, the
	 *          sources that guarantee them for other projects, and the fixes
	 */
	check(flowId: string, projectId: string, requirements: RunRequirementsRecord | undefined): string | undefined {
		if (requirements === undefined || this.declared.unread().length > 0) {
			return undefined;
		}
		const sets: { subject: string; required: string[]; profile: string | undefined }[] = [
			{ subject: `Flow "${flowId}"`, required: requirements.run, profile: requirements.profiles?.run },
			...Object.entries(requirements.steps).map(([stepId, required]) => ({
				subject: `Step "${stepId}" of flow "${flowId}"`,
				required,
				profile: requirements.profiles?.steps[stepId] ?? requirements.profiles?.run,
			})),
		];
		const seen = new Set<string>();
		for (const { subject, required, profile } of sets) {
			const signature = JSON.stringify(required);
			if (required.length === 0 || seen.has(signature)) {
				continue;
			}
			seen.add(signature);
			const { serving, elsewhere } = this.declared.providersOfAllForProject(required, projectId);
			if (serving.length === 0 && elsewhere.length > 0) {
				return this.refusal(subject, required, profile, projectId, elsewhere);
			}
		}
		return undefined;
	}

	private refusal(
		subject: string,
		required: string[],
		profile: string | undefined,
		projectId: string,
		elsewhere: string[]
	): string {
		const sources = elsewhere
			.map(
				sourceId =>
					`${sourceId} (serves projects: ${(this.declared.projectsOf(sourceId) ?? []).join(', ') || 'none'})`
			)
			.join(', ');
		return (
			`${subject} requires ${required.join(', ')}${profile === undefined ? '' : ` (profile: ${profile})`}, ` +
			`but no worker source serving project ${projectId} guarantees ${required.length === 1 ? 'it' : 'them'}: ` +
			`${elsewhere.length === 1 ? 'the only source that does serves' : 'the sources that do serve'} other projects: ${sources}. ` +
			`Fix: declare a source for this project (flow worker source add <id> ... --option projects=${projectId}, or add ${projectId} to the projects option of the source ` +
			`above and declare it again), or remove the requirement from the flow. (Checked when the run starts; flow validate has no knowledge of the worker sources.)`
		);
	}
}
