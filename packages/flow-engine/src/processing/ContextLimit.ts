/**
 * ContextLimit -- caps a `claude` model step's context window via Claude Code's own
 * auto-compact, so a long agentic turn never silently grows past a pricing cliff.
 *
 * Why this exists: Claude Haiku 5.5 (`claude-haiku-5-5`) costs 5x per token once a prompt
 * exceeds 100K tokens on the Anthropic API pricing page ($0.50/$2.50 per MTok in/out, vs
 * $0.10/$0.50 under 100K). A multi-turn agentic step (tool calls, file reads) can cross that
 * line without anything about the flow looking wrong -- it just gets 5x more expensive from
 * that point on. `ModelFlowStep.contextLimit` forces Claude's own auto-compact to fire
 * before that happens, via `CLAUDE_CODE_AUTO_COMPACT_WINDOW`/`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`
 * -- deliberately not something a flow author has to know about: this field is the only
 * thing a flow ever sets, and it is translated to those env vars internally.
 */

/**
 * Minimum accepted `contextLimit`. The baseline Claude Code system+tool prompt is already
 * ~18K tokens before any work happens; a limit much lower than this would trigger
 * auto-compact on nearly every turn, defeating the point of the field.
 */
export const CONTEXT_LIMIT_FLOOR = 30_000;

/**
 * Claude Code's own documented minimum for `CLAUDE_CODE_AUTO_COMPACT_WINDOW`. A `contextLimit`
 * below this still gets the window floored to it; `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` is what
 * approximates the lower limit the author actually asked for (see `buildContextLimitEnv`).
 */
export const CLAUDE_AUTO_COMPACT_MIN_WINDOW = 100_000;

const CONTEXT_LIMIT_ENV_KEYS = ['CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE'] as const;

/**
 * Fails loudly on every condition that would make `contextLimit` do something other than
 * what it says, rather than silently overriding or ignoring it:
 *
 * - A non-integer or a value below {@link CONTEXT_LIMIT_FLOOR}.
 * - Any provider other than `claude` -- opencode/codex have no equivalent knob, and
 *   silently doing nothing would look like the limit was applied.
 * - `step.env`/`claudeEnv` already setting either env var this field controls -- a flow
 *   author who set both meant one or the other, and whichever actually wins depends on
 *   merge order the author should not have to reason about.
 * - `session.mode: 'compact'` on the same step -- that sets `--autocompact auto`, which
 *   `CLAUDE_CODE_AUTO_COMPACT_WINDOW` takes precedence over per Claude Code's own rules,
 *   making the flag a silent no-op if both are present.
 */
export function validateContextLimit(params: {
	contextLimit: number;
	provider: string;
	stepEnv: Record<string, string> | undefined;
	claudeEnv: Record<string, string> | undefined;
	sessionMode: 'append' | 'fork' | 'compact' | undefined;
}): void {
	const { contextLimit, provider, stepEnv, claudeEnv, sessionMode } = params;

	if (!Number.isInteger(contextLimit)) {
		throw new Error(`contextLimit must be an integer number of tokens, got ${JSON.stringify(contextLimit)}.`);
	}
	if (contextLimit < CONTEXT_LIMIT_FLOOR) {
		throw new Error(
			`contextLimit must be at least ${String(CONTEXT_LIMIT_FLOOR)} tokens, got ${String(contextLimit)}. ` +
				`Claude's own baseline system+tool prompt is already ~18K tokens before any work happens -- a lower limit would compact on nearly every turn.`
		);
	}
	if (provider !== 'claude') {
		throw new Error(
			`contextLimit is only meaningful for provider: 'claude' (got '${provider}') -- opencode/codex have no equivalent auto-compact knob. Remove contextLimit from this step.`
		);
	}
	for (const key of CONTEXT_LIMIT_ENV_KEYS) {
		if (stepEnv?.[key] !== undefined || claudeEnv?.[key] !== undefined) {
			throw new Error(
				`This step sets both contextLimit and ${key} directly -- remove ${key} from env/claudeEnv and use contextLimit instead, so the actual effective value is not merge-order-dependent.`
			);
		}
	}
	if (sessionMode === 'compact') {
		throw new Error(
			`This step combines contextLimit with session.mode: 'compact'. The env vars contextLimit sets take precedence over the --autocompact flag session.mode: 'compact' adds, per Claude Code's own rules -- making session.mode: 'compact' a silent no-op here. Remove one of the two.`
		);
	}
}

/**
 * Translates a validated `contextLimit` into the env vars Claude Code reads.
 *
 * `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` is only set when `contextLimit` is at or below
 * {@link CLAUDE_AUTO_COMPACT_MIN_WINDOW}: the window itself cannot go below that floor, so a
 * lower effective limit is approximated by lowering the trigger percentage within the
 * floored window instead. This is an UPPER BOUND, not an exact threshold -- Claude's own
 * undocumented base trigger point (observed between ~74K and ~99K tokens on a 100K window)
 * means the real compaction point can land earlier than `contextLimit`, never later.
 */
export function buildContextLimitEnv(contextLimit: number): Record<string, string> {
	if (contextLimit >= CLAUDE_AUTO_COMPACT_MIN_WINDOW) {
		return { CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(contextLimit) };
	}
	const pct = Math.min(100, Math.max(1, Math.round((contextLimit / CLAUDE_AUTO_COMPACT_MIN_WINDOW) * 100)));
	return {
		CLAUDE_CODE_AUTO_COMPACT_WINDOW: String(CLAUDE_AUTO_COMPACT_MIN_WINDOW),
		CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: String(pct),
	};
}

const HAIKU_5_5_MODEL_ID = 'claude-haiku-5-5';

/**
 * Warns when a step is about to run Haiku 5.5 with no `contextLimit` set, so the 5x-above-
 * 100K pricing cliff is at least visible instead of silent.
 *
 * `provider: 'claude' resolves the "haiku" family alias itself (via `ANTHROPIC_DEFAULT_
 * HAIKU_MODEL`, honoured by the real CLI, not by flow-engine's own `MODEL_ALIASES` table --
 * see `ModelAliases.ts`, which deliberately leaves `claude` unmapped). Without reading that
 * override, this warning would never fire for the common case of a step just writing
 * `model: haiku`. Absent an override the alias is NOT assumed to mean 5.5: a real
 * `claude --model haiku` on Bedrock (Claude Code 2.1.302) resolved to `claude-haiku-4-5`, so
 * warning on the bare alias would be a false positive on every haiku step.
 */
export function haikuContextLimitWarning(params: {
	provider: string;
	model: string | undefined;
	contextLimit: number | undefined;
	stepEnv: Record<string, string> | undefined;
	claudeEnv: Record<string, string> | undefined;
	/** Where the CLI will also look for the alias override. Defaults to this process's environment. */
	processEnv?: NodeJS.ProcessEnv;
}): string | undefined {
	const { provider, model, contextLimit, stepEnv, claudeEnv, processEnv = process.env } = params;
	if (provider !== 'claude' || model === undefined || contextLimit !== undefined) return undefined;

	const normalized = model.trim().toLowerCase();
	let resolvesToHaiku55: boolean;
	// Includes Bedrock's `us.anthropic.claude-haiku-5-5` / `global.anthropic...`, which is what the
	// bare alias resolves to there (see ModelAliases).
	if (normalized.includes(HAIKU_5_5_MODEL_ID)) {
		resolvesToHaiku55 = true;
	} else if (normalized === 'haiku') {
		const override =
			stepEnv?.['ANTHROPIC_DEFAULT_HAIKU_MODEL'] ??
			claudeEnv?.['ANTHROPIC_DEFAULT_HAIKU_MODEL'] ??
			processEnv['ANTHROPIC_DEFAULT_HAIKU_MODEL'];
		// Only an explicit override counts: with none, the CLI picks its own default for the alias,
		// which depends on its version and provider and cannot be known from here.
		resolvesToHaiku55 = override?.trim() === HAIKU_5_5_MODEL_ID;
	} else {
		resolvesToHaiku55 = false;
	}
	if (!resolvesToHaiku55) return undefined;

	return (
		`This step runs Haiku 5.5 (${model}) with no contextLimit set. On the Anthropic API pricing, ` +
		`Haiku 5.5 costs 5x per token once the prompt exceeds 100K tokens ($0.50/$2.50 per MTok in/out, ` +
		`vs $0.10/$0.50 under 100K) -- a multi-turn agentic step can cross that line without anything ` +
		`else looking wrong. Set contextLimit (e.g. 100000) on this step to cap it via auto-compact. ` +
		`(If this step runs on Bedrock rather than the Anthropic API directly, this specific pricing tier may not apply -- verify on your own billing.)`
	);
}
