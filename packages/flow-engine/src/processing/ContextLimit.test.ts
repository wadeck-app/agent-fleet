import { describe, expect, it } from 'vitest';

import {
	CONTEXT_LIMIT_FLOOR,
	buildContextLimitEnv,
	haikuContextLimitWarning,
	validateContextLimit,
} from './ContextLimit';

describe('validateContextLimit', () => {
	it('accepts a plain integer at or above the floor on provider claude', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: CONTEXT_LIMIT_FLOOR,
				provider: 'claude',
				stepEnv: undefined,
				claudeEnv: undefined,
				sessionMode: undefined,
			})
		).not.toThrow();
	});

	it('rejects a value below the floor, naming the floor and why', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: CONTEXT_LIMIT_FLOOR - 1,
				provider: 'claude',
				stepEnv: undefined,
				claudeEnv: undefined,
				sessionMode: undefined,
			})
		).toThrow(/30000/);
	});

	it('rejects a non-integer', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: 50_000.5,
				provider: 'claude',
				stepEnv: undefined,
				claudeEnv: undefined,
				sessionMode: undefined,
			})
		).toThrow(/integer/);
	});

	it('rejects a non-positive value even if somehow at the floor boundary check order', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: 0,
				provider: 'claude',
				stepEnv: undefined,
				claudeEnv: undefined,
				sessionMode: undefined,
			})
		).toThrow();
	});

	it('rejects a non-claude provider, naming it', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: 100_000,
				provider: 'opencode',
				stepEnv: undefined,
				claudeEnv: undefined,
				sessionMode: undefined,
			})
		).toThrow(/opencode/);
	});

	it('rejects when step.env already sets CLAUDE_CODE_AUTO_COMPACT_WINDOW', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: 100_000,
				provider: 'claude',
				stepEnv: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '50000' },
				claudeEnv: undefined,
				sessionMode: undefined,
			})
		).toThrow(/CLAUDE_CODE_AUTO_COMPACT_WINDOW/);
	});

	it('rejects when claudeEnv already sets CLAUDE_AUTOCOMPACT_PCT_OVERRIDE', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: 60_000,
				provider: 'claude',
				stepEnv: undefined,
				claudeEnv: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '50' },
				sessionMode: undefined,
			})
		).toThrow(/CLAUDE_AUTOCOMPACT_PCT_OVERRIDE/);
	});

	it('rejects combination with session.mode "compact" (env wins over --autocompact, making it a silent no-op)', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: 100_000,
				provider: 'claude',
				stepEnv: undefined,
				claudeEnv: undefined,
				sessionMode: 'compact',
			})
		).toThrow(/session\.mode/);
	});

	it('does not conflict with session.mode "append" or "fork"', () => {
		expect(() =>
			validateContextLimit({
				contextLimit: 100_000,
				provider: 'claude',
				stepEnv: undefined,
				claudeEnv: undefined,
				sessionMode: 'append',
			})
		).not.toThrow();
	});
});

describe('buildContextLimitEnv', () => {
	it('sets only the window, no PCT, for a limit above 100000', () => {
		expect(buildContextLimitEnv(150_000)).toEqual({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: '150000' });
	});

	it('sets the window to exactly 100000 for a limit of 100000, no PCT needed', () => {
		expect(buildContextLimitEnv(100_000)).toEqual({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: '100000' });
	});

	it("floors the window to 100000 (Claude Code's own minimum) and approximates via PCT for a lower limit", () => {
		const env = buildContextLimitEnv(60_000);
		expect(env['CLAUDE_CODE_AUTO_COMPACT_WINDOW']).toBe('100000');
		expect(env['CLAUDE_AUTOCOMPACT_PCT_OVERRIDE']).toBe('60');
	});

	it('clamps the computed PCT to a minimum of 1', () => {
		const env = buildContextLimitEnv(CONTEXT_LIMIT_FLOOR);
		const pct = Number(env['CLAUDE_AUTOCOMPACT_PCT_OVERRIDE']);
		expect(pct).toBeGreaterThanOrEqual(1);
		expect(pct).toBeLessThanOrEqual(100);
	});
});

describe('haikuContextLimitWarning', () => {
	it('warns when the model is the explicit claude-haiku-5-5 id and no contextLimit is set', () => {
		const warning = haikuContextLimitWarning({
			provider: 'claude',
			model: 'claude-haiku-5-5',
			contextLimit: undefined,
			stepEnv: undefined,
			claudeEnv: undefined,
		});
		expect(warning).toBeDefined();
		expect(warning).toContain('contextLimit');
		expect(warning).toContain('100K');
	});

	// A real `claude --model haiku` on Bedrock (Claude Code 2.1.302) resolved to claude-haiku-4-5, so the
	// bare alias cannot be assumed to mean 5.5: warning would be a false positive on every haiku step.
	it('does not warn for the bare "haiku" alias when nothing says it resolves to 5.5', () => {
		const warning = haikuContextLimitWarning({
			provider: 'claude',
			model: 'haiku',
			contextLimit: undefined,
			stepEnv: undefined,
			claudeEnv: undefined,
			processEnv: {},
		});
		expect(warning).toBeUndefined();
	});

	it('warns for the bare "haiku" alias when ANTHROPIC_DEFAULT_HAIKU_MODEL says claude-haiku-5-5, from step env, claude env or process env', () => {
		const base = { provider: 'claude', model: 'haiku', contextLimit: undefined } as const;
		const override = { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-5-5' };
		expect(
			haikuContextLimitWarning({ ...base, stepEnv: override, claudeEnv: undefined, processEnv: {} })
		).toBeDefined();
		expect(
			haikuContextLimitWarning({ ...base, stepEnv: undefined, claudeEnv: override, processEnv: {} })
		).toBeDefined();
		expect(
			haikuContextLimitWarning({ ...base, stepEnv: undefined, claudeEnv: undefined, processEnv: override })
		).toBeDefined();
	});

	it('does not warn when ANTHROPIC_DEFAULT_HAIKU_MODEL overrides the alias to a different model', () => {
		const warning = haikuContextLimitWarning({
			provider: 'claude',
			model: 'haiku',
			contextLimit: undefined,
			stepEnv: { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5' },
			claudeEnv: undefined,
		});
		expect(warning).toBeUndefined();
	});

	it('does not warn once contextLimit is set', () => {
		const warning = haikuContextLimitWarning({
			provider: 'claude',
			model: 'claude-haiku-5-5',
			contextLimit: 100_000,
			stepEnv: undefined,
			claudeEnv: undefined,
		});
		expect(warning).toBeUndefined();
	});

	it('does not warn for a non-haiku model', () => {
		const warning = haikuContextLimitWarning({
			provider: 'claude',
			model: 'sonnet',
			contextLimit: undefined,
			stepEnv: undefined,
			claudeEnv: undefined,
		});
		expect(warning).toBeUndefined();
	});

	it('does not warn for a non-claude provider', () => {
		const warning = haikuContextLimitWarning({
			provider: 'opencode',
			model: 'haiku',
			contextLimit: undefined,
			stepEnv: undefined,
			claudeEnv: undefined,
		});
		expect(warning).toBeUndefined();
	});
});
