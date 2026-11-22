/**
 * ModelPriceTable -- a LOCAL price list used to ESTIMATE the cost of a provider that reports none (codex).
 *
 * Nothing here is a measurement: the result is an estimate and callers must label it as such (with
 * {@link PRICES_AS_OF}). An unknown model, or usage that does not add up, is reported as UNKNOWN with a reason,
 * never as 0.
 *
 * Known limit, a LOWER BOUND: every model also has a long-context tier (requests above 272000 tokens) billed at
 * higher prices. The tier applies per REQUEST, while codex reports usage cumulated over the whole thread, so it
 * cannot be applied. Tiers are ignored: for a thread with requests above 272000 tokens the estimate is below the
 * real cost.
 *
 * Token semantics (codex): `input` INCLUDES the cached and the cache-write tokens. `output` is assumed to include the
 * reasoning tokens (OpenAI semantics; unverified, reasoning was 0 in every capture), so reasoning is not added.
 */

/** Date of the prices below (the models.dev snapshot shipped in the opencode cache file). */
export const PRICES_AS_OF = '2026-11-08';

/** Where the prices come from. */
export const PRICES_SOURCE =
	'models.dev snapshot shipped in the opencode cache file (~/.cache/opencode/models.json, file date 2026-11-08), provider amazon-bedrock (OpenAI-on-Bedrock ids) and openai (direct ids); standard tier only, long-context tier ignored';

/** USD per million tokens. */
interface ModelPrice {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

/** Usage of a request or of a whole thread (cumulative), in tokens. */
export interface PriceUsage {
	/** Total input, INCLUDING `cachedInputTokens` and `cacheWriteInputTokens`. */
	inputTokens: number;
	cachedInputTokens: number;
	cacheWriteInputTokens: number;
	/** Output, assumed to include the reasoning tokens. */
	outputTokens: number;
}

export type PriceEstimate = { usd: number; pricesAsOf: string } | { unknownReason: string };

const LUNA: ModelPrice = { input: 0.22, output: 1.32, cacheRead: 0.022, cacheWrite: 0.275 };
const TERRA: ModelPrice = { input: 2.2, output: 13.2, cacheRead: 0.22, cacheWrite: 2.75 };
const SOL: ModelPrice = { input: 4.4, output: 22, cacheRead: 0.44, cacheWrite: 5.5 };
const GLOBAL_LUNA: ModelPrice = { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 };
const GLOBAL_TERRA: ModelPrice = { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 };
const GLOBAL_SOL: ModelPrice = { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 };

// gpt-6 and gpt-6.1 on Bedrock (same snapshot). gpt-6.2 and the astra tier are not listed: they are not enabled for the
// codex role (gpt-6.2-sol answers AccessDenied aws-marketplace:Subscribe), so no request of ours can use them.
const LUNA_6: ModelPrice = { input: 0.11, output: 0.55, cacheRead: 0.011, cacheWrite: 0.1375 };
const GLOBAL_LUNA_6: ModelPrice = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };
const SOL_6: ModelPrice = { input: 2.2, output: 11, cacheRead: 0.22, cacheWrite: 2.75 };
const GLOBAL_SOL_6: ModelPrice = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
const TERRA_61: ModelPrice = { input: 1.1, output: 5.5, cacheRead: 0.055, cacheWrite: 1.375 };
const GLOBAL_TERRA_61: ModelPrice = { input: 1, output: 5, cacheRead: 0.05, cacheWrite: 1.25 };
const SOL_61: ModelPrice = { input: 2.2, output: 11, cacheRead: 0.11, cacheWrite: 2.75 };
const GLOBAL_SOL_61: ModelPrice = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

const PRICES: Readonly<Record<string, ModelPrice>> = {
	'openai.gpt-6-luna': LUNA_6,
	'us.openai.gpt-6-luna': LUNA_6,
	'global.openai.gpt-6-luna': GLOBAL_LUNA_6,
	'openai.gpt-6-sol': SOL_6,
	'us.openai.gpt-6-sol': SOL_6,
	'global.openai.gpt-6-sol': GLOBAL_SOL_6,
	'openai.gpt-6.1-terra': TERRA_61,
	'us.openai.gpt-6.1-terra': TERRA_61,
	'global.openai.gpt-6.1-terra': GLOBAL_TERRA_61,
	'openai.gpt-6.1-sol': SOL_61,
	'us.openai.gpt-6.1-sol': SOL_61,
	'global.openai.gpt-6.1-sol': GLOBAL_SOL_61,
	'openai.gpt-5.6-luna': LUNA,
	'us.openai.gpt-5.6-luna': LUNA,
	'in.openai.gpt-5.6-luna': LUNA,
	'openai.gpt-5.6-terra': TERRA,
	'us.openai.gpt-5.6-terra': TERRA,
	'in.openai.gpt-5.6-terra': TERRA,
	'openai.gpt-5.6-sol': SOL,
	'us.openai.gpt-5.6-sol': SOL,
	'global.openai.gpt-5.6-luna': GLOBAL_LUNA,
	'global.openai.gpt-5.6-terra': GLOBAL_TERRA,
	'global.openai.gpt-5.6-sol': GLOBAL_SOL,
	'gpt-5.6-luna': GLOBAL_LUNA,
	'gpt-5.6-terra': GLOBAL_TERRA,
	'gpt-5.6-sol': GLOBAL_SOL,
	'gpt-5.6': GLOBAL_SOL,
};

export class ModelPriceTable {
	/** Exact id match: no prefix stripping, no family guessing. */
	has(modelId: string): boolean {
		return Object.hasOwn(PRICES, modelId);
	}

	/** The cost of `usage` on `modelId`, or why it cannot be established. Never 0 for an unknown. */
	estimate(modelId: string, usage: PriceUsage): PriceEstimate {
		if (!this.has(modelId)) {
			return { unknownReason: `model '${modelId}' is not in the price table of ${PRICES_AS_OF}` };
		}
		const price = PRICES[modelId]!;
		for (const [name, value] of Object.entries(usage)) {
			if (!Number.isFinite(value) || value < 0) {
				return { unknownReason: `usage is inconsistent: ${name} is ${value}` };
			}
		}
		const uncached = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens;
		if (uncached < 0) {
			return {
				unknownReason: `usage is inconsistent: input ${usage.inputTokens} is below cached ${usage.cachedInputTokens} + cache write ${usage.cacheWriteInputTokens}`,
			};
		}
		const usd =
			(uncached * price.input +
				usage.cachedInputTokens * price.cacheRead +
				usage.cacheWriteInputTokens * price.cacheWrite +
				usage.outputTokens * price.output) /
			1e6;
		return { usd, pricesAsOf: PRICES_AS_OF };
	}
}
