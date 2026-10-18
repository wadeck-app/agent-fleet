import type { StepMeta } from 'flow-engine/types';

export function formatDuration(startedAt: string, completedAt: string | null): string {
	if (!completedAt) return 'running';
	const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

export function formatStarted(iso: string): string {
	return iso.replace('T', ' ').slice(0, 19);
}

/** `meta.cost` only exists on ModelStepMeta -- a script step's meta has no such field. */
export function formatModelCost(meta: StepMeta | undefined): string | undefined {
	if (!meta || !('cost' in meta)) return undefined;
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
	return `cost: $${cost.usd.toFixed(4)} (${cost.input_tokens} in / ${cost.output_tokens} out${cacheSuffix} tokens, ${meta.duration_ms}ms)`;
}

/** Fixed-width column: truncates when longer, right-pads with spaces otherwise. */
export function padTruncate(s: string, width: number): string {
	return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}
