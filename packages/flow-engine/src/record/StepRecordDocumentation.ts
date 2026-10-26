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
			'',
			'Attempt log: every settled attempt of a step (first run, retry, loop pass, relaunch after a failed sub-step, resume) is kept with its duration, end reason, model, provider, session id, cost, tokens, turns, tool calls and number of files written (at most 50 per step and 400 per execution; older ones are folded into totals, never dropped silently). Records written before this existed have no attempt log: `flow show` then prints the cost of the last attempt only, labelled as such.',
			'Cost: the usd and tokens a claude session reports are CUMULATIVE per session (measured), and a relaunch resumes the session. The cost of an attempt is therefore its difference with the previous attempt of the same session, and the step total is the sum of the final values of its sessions. A cost that cannot be established (killed before its result, codex which reports none, no session id, a cumulative value that decreases, a provider whose semantics are unverified for a shared session) is UNKNOWN: it is never summed or shown as 0, and the total reads like `$2.7900+ (2 attempts unknown)` (a lower bound).',
			'Not observable: files written through a shell (`sed -i`, redirects, scripts), the partial cost of a killed process, codex turns.',
			'',
			'Secrets: declared secrets (`type: password`) are replaced by `[secret:NAME]` before anything is written, and the value is masked before it is cut, so a cap cannot expose part of it.',
			'Anything else IS stored as is: a token in a plain input, in an environment variable inherited by the step, or printed by the step is not masked unless you declare it as a secret (`type: password` input, then `secrets: [NAME]` on the script step). Declare every sensitive value; do not print or return secrets from a step.',
		].join('\n');
	}
}
