import { describe, expect, it } from 'vitest';

import { TemplateRenderer } from './TemplateRenderer';
import type { TemplateContext } from './TemplateRenderer';

describe('TemplateRenderer - steps.X.meta', () => {
	const renderer = new TemplateRenderer();

	function makeContext(stepMeta?: Map<string, Record<string, unknown>>): TemplateContext {
		return {
			inputs: {},
			stepOutputs: new Map([['draft', { response: 'a haiku' }]]),
			taskMetadata: {},
			stepMeta: stepMeta ?? new Map(),
		};
	}

	it('resolves steps.draft.meta.session_id', () => {
		const ctx = makeContext(
			new Map([['draft', { session_id: 'sess-abc', duration_ms: 1000, model: 'haiku', session_file: '', ttft_ms: 500, cost: { input_tokens: 10, output_tokens: 5, usd: 0.001 } }]])
		);
		const result = renderer.render('${{ steps.draft.meta.session_id }}', ctx);
		expect(result).toBe('sess-abc');
	});

	it('resolves steps.draft.meta.cost.usd', () => {
		const ctx = makeContext(
			new Map([['draft', { session_id: 'x', duration_ms: 1000, model: 'haiku', session_file: '', ttft_ms: 0, cost: { input_tokens: 10, output_tokens: 5, usd: 0.0025 } }]])
		);
		const result = renderer.render('${{ steps.draft.meta.cost.usd }}', ctx);
		expect(result).toBe('0.0025');
	});

	it('resolves steps.script.meta.exit_code', () => {
		const ctx = makeContext(
			new Map([['script', { exit_code: 0, duration_ms: 50 }]])
		);
		const result = renderer.render('${{ steps.script.meta.exit_code }}', ctx);
		expect(result).toBe('0');
	});

	it('throws on unknown step in meta', () => {
		const ctx = makeContext(new Map());
		expect(() => renderer.render('${{ steps.nonexistent.meta.session_id }}', ctx)).toThrow();
	});
});
