import { RequirementSyntax } from 'flow-engine';

/**
 * Decides whether a worker's source guarantees what a step requires.
 *
 * Matching is AND over exact entries (`key=value` or keyword): there is no ordering between values in step 1, so
 * `clean=run` does not satisfy `clean=step`. A worker advertising several values of one key satisfies each of them.
 *
 * `guarantees` must come from the AUTHENTICATED source of the worker (its built instance), never from the labels the
 * worker declares itself: a label states where a step prefers to go, a guarantee states what is enforced.
 */
export function workerMeetsRequirements(required: readonly string[], guarantees: readonly string[]): boolean {
	return missingRequirements(required, guarantees).length === 0;
}

/** The required entries the guarantees do not cover, in the order required. */
export function missingRequirements(required: readonly string[], guarantees: readonly string[]): string[] {
	const available = new Set(guarantees);
	return required.filter(entry => !available.has(entry));
}

/**
 * The requirements of one step: the run's, plus the step's own `requires`, sorted and without duplicates.
 *
 * The own list is checked here again because a step injected at run time never went through the validator.
 *
 * @throws when the step's `requires` is malformed; the caller fails the step with this message, since a set that cannot
 *         be read would otherwise look like "no worker is available" forever.
 */
export function normaliseStepRequirements(
	runRequirements: readonly string[],
	stepRequires: unknown,
	stepId: string
): string[] {
	const own = RequirementSyntax.normalise(stepRequires, `Step "${stepId}"`);
	return [...new Set([...runRequirements, ...own])].sort();
}
