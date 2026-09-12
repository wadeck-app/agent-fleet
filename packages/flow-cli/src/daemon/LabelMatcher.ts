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
	assertStepLabels(required);

	const available = new Set(workerLabels);
	return required.every(label => available.has(label));
}

/**
 * Checks that a step's declared labels can be matched at all.
 *
 * Separate from matching so a malformed set is caught once, when the step is routed,
 * rather than looking like "no worker is available" against every candidate in turn.
 *
 * @throws when `labels` is present but is not a list of non-empty strings.
 */
export function assertStepLabels(labels: unknown, stepId?: string): asserts labels is string[] | undefined {
	if (labels === undefined) return;
	const where = stepId === undefined ? '' : ` on step "${stepId}"`;

	if (!Array.isArray(labels)) {
		throw new Error(
			`Step labels${where} must be a list, got ${typeof labels}: ${JSON.stringify(labels)}. ` +
				`Write labels as a list, for example ["gpu", "linux"], which is matched as AND. ` +
				`Expressions such as "a || b" are not supported.`
		);
	}

	for (const label of labels) {
		if (typeof label !== 'string') {
			throw new Error(
				`Step labels${where} must all be strings, got ${typeof label}: ${JSON.stringify(label)} in ${JSON.stringify(labels)}`
			);
		}
		if (label.trim() === '') {
			throw new Error(
				`Step labels${where} must not be empty: ${JSON.stringify(labels)} contains a blank entry. ` +
					`An empty label would match every worker, which is what omitting labels already does.`
			);
		}
	}
}
