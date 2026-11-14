import { editDistance } from '../requirements/EditDistance';

/** The "Did you mean" lookup shared by the host tool validation and the per-call check. */
export class NearestName {
	/**
	 * The candidate closest to `name` (a near miss), or undefined when none is close enough. Never `name` itself.
	 * Ties go to the first candidate.
	 */
	static of(name: string, candidates: readonly string[]): string | undefined {
		const limit = name.length <= 4 ? 1 : 2;
		let best: string | undefined;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const candidate of candidates) {
			if (candidate === name) {
				continue;
			}
			const distance = editDistance(candidate, name);
			if (distance <= limit && distance < bestDistance) {
				best = candidate;
				bestDistance = distance;
			}
		}
		return best;
	}
}
