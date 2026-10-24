import { DEFAULT_STEP_RECORD_LIMITS } from './StepRecordLimits';

/** Markdown section about what the execution record keeps of each step, embedded in the generated flow documentation. */
export class StepRecordDocumentation {
	public generate(): string {
		const { perValue, perStep, perExecution } = DEFAULT_STEP_RECORD_LIMITS;
		return [
			'## Section 10: What an execution records',
			'',
			'The daemon writes, for every step attempt, into the execution record (`~/.config/flow/executions/<id>.json`, also the source of `flow history` and the run pages):',
			'',
			'- inputs: the flow inputs the step reads (`inputs.NAME`), the rendered `env` of a script step (`env.NAME`), the names of its declared `secrets:` (placeholder only), and the rendered prompt of a model step (`prompt`).',
			'- outputs: the output map later steps consume (for a script step without `output:` this includes `stdout`, `stderr` and `rawOutput`).',
			'- the tail of stdout and stderr (for a model step, stdout is its final response).',
			'',
			`Caps: ${String(perValue)} characters per value, ${String(perStep)} per step, ${String(perExecution)} per execution. A value over a cap is cut (inputs and outputs keep the head, stdout and stderr the tail) and marked \`truncated\` with the length of the original; it is never dropped silently.`,
			'Read it back with `flow show <execution-id> --io`. Records written before this existed say "not recorded for this run".',
			'',
			'Secrets: declared secrets (`type: password`) are replaced by `[secret:NAME]` before anything is written, and the value is masked before it is cut, so a cap cannot expose part of it.',
			'Anything else IS stored as is: a token in a plain input, in an environment variable inherited by the step, or printed by the step is not masked unless you declare it as a secret (`type: password` input, then `secrets: [NAME]` on the script step). Declare every sensitive value; do not print or return secrets from a step.',
		].join('\n');
	}
}
