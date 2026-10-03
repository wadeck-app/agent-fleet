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
		// The `amazon-bedrock/` prefix is required, not decoration: `opencode run -m` takes
		// `provider/model`, and a bare model id comes back as an unexplained server error rather
		// than "unknown model". Leaving it off made every aliased step fail this way.
		haiku: 'amazon-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
		sonnet: 'amazon-bedrock/us.anthropic.claude-sonnet-5',
		opus: 'amazon-bedrock/us.anthropic.claude-opus-5',
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

const ANTHROPIC_FAMILY_NAMES = new Set(['sonnet', 'haiku', 'opus']);

function isAnthropicModel(model: string): boolean {
	const lower = model.trim().toLowerCase();
	return ANTHROPIC_FAMILY_NAMES.has(lower) || lower.includes('claude') || lower.includes('anthropic');
}

function isOpenAiModel(model: string): boolean {
	const lower = model.trim().toLowerCase();
	return /^(gpt|o1|o3|o4)(-|$)/.test(lower) || lower.includes('openai');
}

/**
 * Catches a step naming a model family its provider cannot run, before any process is
 * spawned -- `codex`+`sonnet` used to reach a real Bedrock/OpenAI endpoint and fail with a
 * 404 five retries later. Only the two unambiguous cases are rejected (an Anthropic family
 * name on codex, an OpenAI family name on claude); `opencode` is a multi-provider router
 * (model string is `provider/model`) and is deliberately left alone, same reasoning as
 * `MODEL_ALIASES` above.
 */
export function checkProviderModelCompatibility(provider: string, model: string | undefined): string | undefined {
	if (model === undefined) return undefined;

	if (provider === 'codex' && isAnthropicModel(model)) {
		return `codex does not support Anthropic/Claude models (got '${model}'). codex only runs OpenAI models (gpt-*, o1-*, o3-*, ...).`;
	}
	if (provider === 'claude' && isOpenAiModel(model)) {
		return `claude does not support OpenAI models (got '${model}'). claude only runs Anthropic/Claude models (sonnet, haiku, opus, or an explicit claude-* id).`;
	}
	return undefined;
}
