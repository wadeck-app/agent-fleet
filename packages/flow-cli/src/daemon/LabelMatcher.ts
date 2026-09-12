/**
 * Decides whether a worker carries the labels a step demands.
 *
 * Matching is AND: every label the step lists must be present on the worker. A step
 * that lists nothing runs anywhere, which is the permissive default (D#22) -- labels
 * are greenfield, so an exclusive default would leave a freshly launched worker inert
 * and make the feature look broken.
 *
 * Labels are routing, never authorization (T-07). Satisfying them decides *where* a
 * step runs and grants no privilege.
 *
 * @param required - labels declared by the step
 * @param workerLabels - labels the worker inherited from its source (D#30)
 * @throws when `required` is not a list of non-empty strings. Accepting a bare string
 *         would silently AND the atoms of an expression like "a || b", mis-executing
 *         it rather than reporting that the form is unsupported (D#7, P-4).
 */
export function workerSatisfiesLabels(required: string[] | undefined, workerLabels: string[]): boolean {
	if (required === undefined) return true;

	if (!Array.isArray(required)) {
		throw new Error(
			`Step labels must be a list, got ${typeof required}: ${JSON.stringify(required)}. ` +
				`Write labels as a list, for example ["gpu", "linux"], which is matched as AND. ` +
				`Expressions such as "a || b" are not supported.`
		);
	}

	for (const label of required) {
		if (typeof label !== 'string') {
			throw new Error(
				`Step labels must all be strings, got ${typeof label}: ${JSON.stringify(label)} in ${JSON.stringify(required)}`
			);
		}
		if (label.trim() === '') {
			throw new Error(
				`Step labels must not be empty: ${JSON.stringify(required)} contains a blank entry. ` +
					`An empty label would match every worker, which is what omitting labels already does.`
			);
		}
	}

	const available = new Set(workerLabels);
	return required.every(label => available.has(label));
}
