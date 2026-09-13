/**
 * Family names ("sonnet") to concrete model ids, per provider.
 *
 * This exists because bedrock's ids are not guessable and not consistent: some carry a date
 * (`us.anthropic.claude-haiku-4-5-20251001-v1:0`), some do not
 * (`us.anthropic.claude-sonnet-4-6`), and one carries a bare version suffix
 * (`us.anthropic.claude-opus-4-6-v1`). Asking a flow author to remember which is which is how a
 * step ends up pinned to a model nobody meant, or failing with "invalid model identifier".
 *
 * Two rules keep this from becoming a cage:
 *
 * - Anything that is not a known family name is **passed through unchanged**, so an explicit id
 *   still works and an older version can be pinned on purpose.
 * - A provider with no table here is left entirely alone. `claude` resolves haiku/sonnet/opus
 *   itself and honours `ANTHROPIC_DEFAULT_*_MODEL`, so mapping them here would silently override
 *   the user's own configuration; `codex` runs OpenAI models on a different account, where a
 *   family name means nothing.
 *
 * Every id below was verified by calling it -- see `.claude/scripts/model-inventory.mjs` and
 * `.claude/docs/model-inventory.md`. The
 * `us.` prefix is the cross-region inference profile, which is what the account exposes and what
 * Claude Code itself uses.
 */
export const MODEL_ALIASES: Record<string, Record<string, string>> = {
	opencode: {
		haiku: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
		sonnet: 'us.anthropic.claude-sonnet-5',
		opus: 'us.anthropic.claude-opus-5',
	},
};

/**
 * The model id to hand the provider.
 *
 * @param provider - the provider name from the step (`claude`, `opencode`, `codex`, ...)
 * @param model - what the step asked for, or undefined to use the provider's own default
 * @returns the resolved id, or the input unchanged when it is not a family name
 */
export function resolveModelAlias(provider: string, model: string | undefined): string | undefined {
	if (model === undefined) return undefined;

	const table = MODEL_ALIASES[provider];
	if (table === undefined) return model;

	return table[model.trim().toLowerCase()] ?? model;
}
