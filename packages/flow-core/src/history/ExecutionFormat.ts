import type { StepMeta } from 'flow-engine/types';

/** Largest duration still written as seconds with one decimal: 59.95s would round to "60.0s". */
const SECONDS_FORMAT_LIMIT_MS = 59950;

export function formatDuration(startedAt: string, completedAt: string | null): string {
	if (!completedAt) {
		return 'running';
	}
	const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
	if (ms < 1000) {
		return `${ms}ms`;
	}
	// Below 59.95s the one-decimal form cannot round up to "60.0s".
	if (ms < SECONDS_FORMAT_LIMIT_MS) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	// Round once on the total so a carry (59.6s past the minute) lands in the next unit instead of printing "60s".
	const totalSeconds = Math.round(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) {
		return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
	}
	return `${minutes}m${totalSeconds % 60}s`;
}

export function formatStarted(iso: string): string {
	return iso.replace('T', ' ').slice(0, 19);
}

/**
 * `meta.cost` only exists on ModelStepMeta -- a script step's meta has no such field. `costText` replaces the raw
 * `$usd` of the meta (the last attempt, cumulative for a resumed claude session) by the step's computed cost.
 */
export function formatModelCost(meta: StepMeta | undefined, costText?: string): string | undefined {
	if (!meta || !('cost' in meta)) {
		return undefined;
	}
	const { cost } = meta as {
		cost: {
			input_tokens: number;
			output_tokens: number;
			cache_read_tokens: number;
			cache_write_tokens: number;
			usd: number;
		};
	};
	const cacheTokens = (cost.cache_read_tokens ?? 0) + (cost.cache_write_tokens ?? 0);
	// Cache tokens are an ADDITIONAL volume on top of "in" tokens, not already counted there --
	// surfacing them separately avoids misreading "in" as the total processed input.
	const cacheSuffix = cacheTokens > 0 ? ` + ${cacheTokens} cache` : '';
	return `cost: ${costText ?? `$${cost.usd.toFixed(4)}`} (${cost.input_tokens} in / ${cost.output_tokens} out${cacheSuffix} tokens, ${meta.duration_ms}ms)`;
}

/** Fixed-width column: truncates when longer, right-pads with spaces otherwise. */
export function padTruncate(s: string, width: number): string {
	return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}
