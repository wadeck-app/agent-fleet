import { describe, expect, it } from 'vitest';

import { MODEL_ALIASES, checkProviderModelCompatibility, resolveModelAlias } from './ModelAliases';

describe('resolveModelAlias - opencode', () => {
	// A flow says "sonnet" and means "the current one". Bedrock ids are dated, undated or
	// suffixed depending on the model, so nobody should have to remember which.
	// The provider prefix is not decoration: `opencode run -m` takes `provider/model` and rejects
	// a bare model id with an unexplained server error. Omitting it made every aliased step fail.
	it('maps the family names to provider-qualified bedrock ids', () => {
		expect(resolveModelAlias('opencode', 'sonnet')).toBe('amazon-bedrock/us.anthropic.claude-sonnet-5-5');
		expect(resolveModelAlias('opencode', 'haiku')).toBe('amazon-bedrock/us.anthropic.claude-haiku-5-5');
		expect(resolveModelAlias('opencode', 'opus')).toBe('amazon-bedrock/us.anthropic.claude-opus-5');
	});

	it('accepts the family name whatever the casing', () => {
		expect(resolveModelAlias('opencode', 'Sonnet')).toBe('amazon-bedrock/us.anthropic.claude-sonnet-5-5');
		expect(resolveModelAlias('opencode', 'HAIKU')).toBe('amazon-bedrock/us.anthropic.claude-haiku-5-5');
	});

	it('always produces something with a provider prefix', () => {
		for (const family of ['haiku', 'sonnet', 'opus']) {
			expect(resolveModelAlias('opencode', family)).toMatch(/^[a-z-]+\//);
		}
	});

	// The fallback that keeps every existing flow working, and the escape hatch for pinning an
	// older version on purpose.
	it('passes an explicit id through untouched', () => {
		const pinned = 'amazon-bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0';

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
	// claude honours ANTHROPIC_DEFAULT_*_MODEL itself, so a user's own choice must never be
	// overridden with ours: with an override set, the family name goes through untouched.
	it('leaves claude to resolve a family name the user has overridden', () => {
		const env = {
			ANTHROPIC_DEFAULT_SONNET_MODEL: 'us.anthropic.claude-sonnet-5',
			ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5',
		};
		expect(resolveModelAlias('claude', 'sonnet', env)).toBe('sonnet');
		expect(resolveModelAlias('claude', 'haiku', env)).toBe('haiku');
	});

	// Without an override, haiku and sonnet mean 5.5. Ids checked against AWS (list-inference-profiles)
	// and with a real `claude -p --model <id>` call (canonicalModel claude-haiku-5-5 / claude-sonnet-5-5).
	it('defaults claude haiku and sonnet to 5.5, with the Bedrock id when Bedrock is in use', () => {
		expect(resolveModelAlias('claude', 'haiku', {})).toBe('claude-haiku-5-5');
		expect(resolveModelAlias('claude', 'sonnet', {})).toBe('claude-sonnet-5-5');
		const bedrock = { CLAUDE_CODE_USE_BEDROCK: '1' };
		expect(resolveModelAlias('claude', 'Haiku', bedrock)).toBe('us.anthropic.claude-haiku-5-5');
		expect(resolveModelAlias('claude', 'sonnet', bedrock)).toBe('us.anthropic.claude-sonnet-5-5');
	});

	it('only applies the claude default to the families it was asked to change', () => {
		expect(resolveModelAlias('claude', 'opus', {})).toBe('opus');
		expect(resolveModelAlias('claude', 'claude-sonnet-4-6', {})).toBe('claude-sonnet-4-6');
	});

	// codex runs OpenAI models on a different bedrock account, where "sonnet" means nothing --
	// it has no Anthropic family table, only its own luna/terra one.
	it('leaves codex model names untouched when not a known codex family name', () => {
		expect(resolveModelAlias('codex', 'openai.gpt-5.6-terra')).toBe('openai.gpt-5.6-terra');
		expect(resolveModelAlias('codex', 'sonnet')).toBe('sonnet');
	});

	// Verified live via `codex exec -m <id>`: bare id, no provider prefix, no `us.` profile prefix.
	it('resolves luna/terra to bare OpenAI-on-Bedrock ids for codex', () => {
		expect(resolveModelAlias('codex', 'luna')).toBe('openai.gpt-5.6-luna');
		expect(resolveModelAlias('codex', 'terra')).toBe('openai.gpt-5.6-terra');
	});

	// Verified live via `opencode run -m amazon-bedrock/<id>` with OPENCODE_CONFIG pointed at
	// the openai-codex-profile config.
	it('resolves luna/terra to amazon-bedrock-prefixed ids for opencode', () => {
		expect(resolveModelAlias('opencode', 'luna')).toBe('amazon-bedrock/openai.gpt-5.6-luna');
		expect(resolveModelAlias('opencode', 'terra')).toBe('amazon-bedrock/openai.gpt-5.6-terra');
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
			'amazon-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
			'amazon-bedrock/us.anthropic.claude-sonnet-4-5-20250929-v1:0',
			'amazon-bedrock/us.anthropic.claude-sonnet-4-6',
			'amazon-bedrock/us.anthropic.claude-sonnet-5',
			'amazon-bedrock/us.anthropic.claude-opus-4-6-v1',
			'amazon-bedrock/us.anthropic.claude-opus-4-7',
			'amazon-bedrock/us.anthropic.claude-opus-4-8',
			'amazon-bedrock/us.anthropic.claude-opus-5',
			// 5.5 ids: listed ACTIVE by `aws bedrock list-inference-profiles` and answered by a real
			// `claude -p --model us.anthropic.claude-{haiku,sonnet}-5-5`. Not yet called through opencode
			// itself: its calls hung for an unrelated reason, even for the known-good Haiku 4.5 id.
			'amazon-bedrock/us.anthropic.claude-haiku-5-5',
			'amazon-bedrock/us.anthropic.claude-sonnet-5-5',
			// Verified live in this session: opencode run -m amazon-bedrock/openai.gpt-5.6-luna
			// (and -terra) with OPENCODE_CONFIG pointed at the openai-codex-profile config.
			'amazon-bedrock/openai.gpt-5.6-luna',
			'amazon-bedrock/openai.gpt-5.6-terra',
		]);

		for (const id of Object.values(MODEL_ALIASES['opencode'] ?? {})) {
			expect(proven, `${id} is not in the verified set`).toContain(id);
		}
	});

	// fable-5 and fable-5-1 exist in the bedrock account but the IAM role is not allowed to call
	// them, so an alias pointing at one would fail with "Forbidden" at run time.
	it('does not map anything to a model the IAM role cannot call', () => {
		const forbidden = [
			'amazon-bedrock/us.anthropic.claude-fable-5',
			'amazon-bedrock/us.anthropic.claude-fable-5-1',
		];

		for (const table of Object.values(MODEL_ALIASES)) {
			for (const id of Object.values(table)) {
				expect(forbidden).not.toContain(id);
			}
		}
	});
});

describe('checkProviderModelCompatibility', () => {
	it('rejects an Anthropic family name on codex', () => {
		expect(checkProviderModelCompatibility('codex', 'sonnet')).toMatch(/does not support Anthropic/);
		expect(checkProviderModelCompatibility('codex', 'haiku')).toMatch(/does not support Anthropic/);
		expect(checkProviderModelCompatibility('codex', 'opus')).toMatch(/does not support Anthropic/);
	});

	it('rejects an explicit Claude/Anthropic id on codex', () => {
		expect(checkProviderModelCompatibility('codex', 'claude-sonnet-4-5')).toMatch(/does not support Anthropic/);
		expect(checkProviderModelCompatibility('codex', 'us.anthropic.claude-opus-5')).toMatch(
			/does not support Anthropic/
		);
	});

	it('rejects an OpenAI model name on claude', () => {
		expect(checkProviderModelCompatibility('claude', 'gpt-5')).toMatch(/does not support OpenAI/);
		expect(checkProviderModelCompatibility('claude', 'o3-mini')).toMatch(/does not support OpenAI/);
	});

	it('accepts a matching family on each provider', () => {
		expect(checkProviderModelCompatibility('codex', 'gpt-5')).toBeUndefined();
		expect(checkProviderModelCompatibility('claude', 'sonnet')).toBeUndefined();
	});

	it('leaves opencode alone -- it is a multi-provider router', () => {
		expect(checkProviderModelCompatibility('opencode', 'sonnet')).toBeUndefined();
		expect(checkProviderModelCompatibility('opencode', 'gpt-5')).toBeUndefined();
	});

	it('leaves an unset model alone', () => {
		expect(checkProviderModelCompatibility('codex', undefined)).toBeUndefined();
		expect(checkProviderModelCompatibility('claude', undefined)).toBeUndefined();
	});

	it('accepts luna/terra on codex, rejects them on claude', () => {
		expect(checkProviderModelCompatibility('codex', 'luna')).toBeUndefined();
		expect(checkProviderModelCompatibility('codex', 'terra')).toBeUndefined();
		expect(checkProviderModelCompatibility('claude', 'luna')).toMatch(/does not support OpenAI/);
		expect(checkProviderModelCompatibility('claude', 'terra')).toMatch(/does not support OpenAI/);
	});
});
