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
			'Cost: the usd and tokens a claude session reports are CUMULATIVE per session (measured), and a relaunch resumes the session. The cost of an attempt is therefore its difference with the previous attempt of the same session, and the step total is the sum of the final values of its sessions. A cost that cannot be established (killed before its result, a codex step whose model is unknown or not in the price table, no session id, a cumulative value that decreases, a provider whose semantics are unverified for a shared session) is UNKNOWN: it is never summed or shown as 0, and the total reads like `$2.7900+ (2 attempts unknown)` (a lower bound).',
			'Codex reports no cost, only tokens: its usd is an ESTIMATE priced from the built-in table of `ModelPriceTable.ts` (prices dated, long-context tier ignored so a lower bound), shown as `~$x (estimated, prices of <date>)` and flagged `*Estimated: true` in events and the HTTP API. A codex step with no `model:` is priced with the model codex recorded in its own session file; when that cannot be read the cost stays unknown with the reason. OpenCode and claude report their own usd.',
			'`flow cost [-p <ref>] [--flow <id>] [--status <s>] [--since <ISO date>] [-n <n>] [--by flow|input:<name>] [--json]` reads those same figures (never re-prices) over many runs, offline. `--json` prints one document `{ schema: 1, pricesAsOf?, filters, by: "run"|"flow"|"input:<name>", rows }`. Per-run rows: `executionId, flowId, status, startedAt, totalCostUsd?, totalCostComplete?, totalCostEstimated?, totalCostPricesAsOf?, inputs`. A run with unknown cost keeps its row with the cost fields ABSENT (never 0). `--by flow` rows: `flowId, runs, completedRuns, totalUsd?, medianUsdPerRun?, maxUsd?, totalCostComplete` (false when any run is a lower bound or unknown). `--by input:<name>` rows: `value, runs[], totalUsd?, totalCostComplete`, plus a top-level `withoutInput`. Run inputs have no field of their own in the record: they are read from the recorded `inputs.NAME` of the steps, so an input no step read is unknown for that run, and a value may be cut (see caps above). No `-n` means every matching run.',
			'`flow prune (-p <ref> | --flow <id>... | --status <s> | --before <ISO date>) [--dry-run] [--yes] [--json]` deletes execution RECORDS (e.g. probe runs) so they leave `flow history` and `flow cost`; at least one filter is required. Nothing is deleted without `--yes` (it then behaves as `--dry-run` and says so). Only `completed` and `failed` runs are deleted; queued, running, re-queued and paused runs are listed as `refused` and kept. `--json` prints `{ schema: 1, dryRun, deleted | wouldDelete: [{ executionId, flowId, status, startedAt }], refused: [{ executionId, reason }] }`. Exit 0 when done; 1 on a usage error, when `--status` asked for unfinished runs only, or when a record could not be deleted. Deleted with a record: its leftover `<id>.paused-snapshot` and the plugin workspace `.meta` folder it names (marker-checked). Never deleted: the daemon logs and `<project>/.flow/runs/<id>.meta`. Safe while the daemon runs: the store is plain files read on demand, with no index or cache.',
			'Not observable: files written through a shell (`sed -i`, redirects, scripts), the partial cost of a killed process, codex turns.',
			'',
			'Secrets: declared secrets (`type: password`) are replaced by `[secret:NAME]` before anything is written, and the value is masked before it is cut, so a cap cannot expose part of it.',
			'Anything else IS stored as is: a token in a plain input, in an environment variable inherited by the step, or printed by the step is not masked unless you declare it as a secret (`type: password` input, then `secrets: [NAME]` on the script step). Declare every sensitive value; do not print or return secrets from a step.',
		].join('\n');
	}
}
