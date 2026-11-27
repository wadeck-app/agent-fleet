import type { ExecutionState } from 'flow-core';

const INPUT_KEY_PREFIX = 'inputs.';

/**
 * Reads the flow inputs of a run. The execution record has no run-level `inputs` field: the only trace is the
 * `inputs.NAME` entries of each step's recorded io (secrets masked, text possibly cut). An input that no step
 * referenced, or that was recorded before step io existed, is therefore unknown for that run.
 */
export class RunInputReader {
	/** NAME -> recorded text. The first complete (not cut) value in step order wins; otherwise the first cut one. */
	static read(record: ExecutionState): Record<string, string> {
		const found: Record<string, { text: string; truncated: boolean }> = {};
		for (const step of Object.values(record.steps)) {
			for (const [key, value] of Object.entries(step.io?.inputs ?? {})) {
				if (!key.startsWith(INPUT_KEY_PREFIX)) {
					continue;
				}
				const name = key.slice(INPUT_KEY_PREFIX.length);
				const known = found[name];
				if (known === undefined || (known.truncated && !value.truncated)) {
					found[name] = { text: value.text, truncated: value.truncated };
				}
			}
		}
		return Object.fromEntries(Object.entries(found).map(([name, { text }]) => [name, text]));
	}
}
