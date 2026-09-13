import { describe, expect, it } from 'vitest';

import { MODEL_ALIASES, resolveModelAlias } from './ModelAliases';

describe('resolveModelAlias - opencode', () => {
	// A flow says "sonnet" and means "the current one". Bedrock ids are dated, undated or
	// suffixed depending on the model, so nobody should have to remember which.
	it('maps the family names to concrete bedrock ids', () => {
		expect(resolveModelAlias('opencode', 'sonnet')).toBe('us.anthropic.claude-sonnet-5');
		expect(resolveModelAlias('opencode', 'haiku')).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
		expect(resolveModelAlias('opencode', 'opus')).toBe('us.anthropic.claude-opus-5');
	});

	it('accepts the family name whatever the casing', () => {
		expect(resolveModelAlias('opencode', 'Sonnet')).toBe('us.anthropic.claude-sonnet-5');
		expect(resolveModelAlias('opencode', 'HAIKU')).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
	});

	// The fallback that keeps every existing flow working, and the escape hatch for pinning an
	// older version on purpose.
	it('passes an explicit id through untouched', () => {
		const pinned = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

		expect(resolveModelAlias('opencode', pinned)).toBe(pinned);
	});

	it('passes an unknown name through rather than guessing', () => {
		expect(resolveModelAlias('opencode', 'gemini-ultra')).toBe('gemini-ultra');
	});

	it('leaves the provider default alone when no model is named', () => {
		expect(resolveModelAlias('opencode', undefined)).toBeUndefined();
	});
});

describe('resolveModelAlias - other providers', () => {
	// claude resolves haiku/sonnet/opus itself, and honours ANTHROPIC_DEFAULT_*_MODEL. Mapping
	// them here would override a user's own choice with ours.
	it('leaves claude to resolve its own family names', () => {
		expect(resolveModelAlias('claude', 'sonnet')).toBe('sonnet');
		expect(resolveModelAlias('claude', 'haiku')).toBe('haiku');
	});

	// codex runs OpenAI models on a different bedrock account, where "sonnet" means nothing.
	it('leaves codex model names untouched', () => {
		expect(resolveModelAlias('codex', 'openai.gpt-5.6-terra')).toBe('openai.gpt-5.6-terra');
		expect(resolveModelAlias('codex', 'sonnet')).toBe('sonnet');
	});

	it('passes through for a provider it has never heard of', () => {
		expect(resolveModelAlias('some-plugin-provider', 'sonnet')).toBe('sonnet');
	});
});

describe('MODEL_ALIASES', () => {
	// Verified by calling each one: see .claude/scripts/model-inventory.mjs. Anything listed here
	// must have answered, so a typo cannot reach a flow as a silent failure at dispatch time.
	it('only maps to ids proven to answer on this account', () => {
		const proven = new Set([
			'us.anthropic.claude-haiku-4-5-20251001-v1:0',
			'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
			'us.anthropic.claude-sonnet-4-6',
			'us.anthropic.claude-sonnet-5',
			'us.anthropic.claude-opus-4-6-v1',
			'us.anthropic.claude-opus-4-7',
			'us.anthropic.claude-opus-4-8',
			'us.anthropic.claude-opus-5',
		]);

		for (const id of Object.values(MODEL_ALIASES['opencode'] ?? {})) {
			expect(proven, `${id} is not in the verified set`).toContain(id);
		}
	});

	// fable-5 and fable-5-1 exist in the bedrock account but the IAM role is not allowed to call
	// them, so an alias pointing at one would fail with "Forbidden" at run time.
	it('does not map anything to a model the IAM role cannot call', () => {
		const forbidden = ['us.anthropic.claude-fable-5', 'us.anthropic.claude-fable-5-1'];

		for (const table of Object.values(MODEL_ALIASES)) {
			for (const id of Object.values(table)) {
				expect(forbidden).not.toContain(id);
			}
		}
	});
});
