import { describe, expect, it } from 'vitest';

import { ProfileAliases } from './ProfileAliases';
import { eachRow } from './testing/EachRow';

function failure(action: () => unknown): Error {
	try {
		action();
	} catch (error) {
		return error as Error;
	}
	throw new Error('expected the call to throw');
}

describe('ProfileAliases', () => {
	it('maps each tool to its own alias when the aliases are tool names', () => {
		const profiles = ProfileAliases.parse(['claude=host-a', 'codex=host-b', 'opencode=host-c']);

		expect(profiles.aliasFor('claude')).toBe('claude');
		expect(profiles.aliasFor('codex')).toBe('codex');
		expect(profiles.aliasFor('opencode')).toBe('opencode');
		expect(profiles.aliasNames()).toEqual(['claude', 'codex', 'opencode']);
		expect(profiles.hostProfiles()).toEqual({ claude: 'host-a', codex: 'host-b', opencode: 'host-c' });
		expect(profiles.sharedAlias()).toBeUndefined();
	});

	it('splits an entry at the first "=" so a host profile may contain one', () => {
		expect(ProfileAliases.parse(['claude=sso=prod']).hostProfiles()).toEqual({ claude: 'sso=prod' });
	});

	it('lets a lone entry whose alias is not a tool name apply to every tool', () => {
		const profiles = ProfileAliases.parse(['work=host-a']);

		expect(profiles.sharedAlias()).toBe('work');
		expect(['claude', 'codex', 'opencode'].map(tool => profiles.aliasFor(tool as 'claude'))).toEqual([
			'work',
			'work',
			'work',
		]);
		expect(profiles.aliasNames()).toEqual(['work']);
	});

	it('applies a lone claude entry to claude only and refuses a codex step with the fix', () => {
		const profiles = ProfileAliases.parse(['claude=host-a']);

		expect(profiles.sharedAlias()).toBeUndefined();
		expect(profiles.aliasFor('claude')).toBe('claude');
		const error = failure(() => profiles.aliasFor('codex'));
		expect(error.message).toContain(
			'codex step but no codex alias: add codex=<profile> to the profiles option of this source'
		);
		expect(error.message).toContain('claude');
		expect(error.message).not.toContain('host-a');
	});

	it('never falls back to another tool alias (each case)', () =>
		eachRow(
			[
				{ entries: ['claude=a', 'codex=b'], tool: 'opencode' as const },
				{ entries: ['codex=b'], tool: 'claude' as const },
				{ entries: ['opencode=c'], tool: 'codex' as const },
			],
			({ entries, tool }) => {
				expect(failure(() => ProfileAliases.parse(entries).aliasFor(tool)).message).toContain(
					`${tool} step but no ${tool} alias: add ${tool}=<profile>`
				);
			}
		));

	it('fails fast on a tool this layer does not know', () => {
		const profiles = ProfileAliases.parse(['work=a']);

		expect(failure(() => profiles.aliasFor('gemini' as 'claude')).message).toContain('gemini');
	});

	it('refuses several entries when one alias is not a tool name, naming it and the fix', () => {
		const error = failure(() => ProfileAliases.parse(['claude=a', 'work=b']));

		expect(error.message).toContain('"work"');
		expect(error.message).toContain('claude, codex, opencode');
	});

	it('refuses a duplicate alias', () => {
		expect(failure(() => ProfileAliases.parse(['claude=a', 'claude=b'])).message).toContain('twice');
	});

	it('refuses no entry, a malformed entry, an empty profile and an alias the VM config cannot carry (each case)', () =>
		eachRow(
			[
				{ entries: [], fragment: 'At least one' },
				{ entries: ['claude'], fragment: 'alias=profile' },
				{ entries: ['claude='], fragment: 'alias=profile' },
				{ entries: ['=p'], fragment: 'alias=profile' },
				{ entries: ['bad alias=p'], fragment: 'bad alias' },
				{ entries: ['claude=a\nb'], fragment: 'control' },
			],
			({ entries, fragment }) => {
				expect(failure(() => ProfileAliases.parse(entries)).message).toContain(fragment);
			}
		));

	it('picks the first tool a script-first sandbox is prepared for', () => {
		expect(ProfileAliases.parse(['work=a']).firstTool()).toBe('claude');
		expect(ProfileAliases.parse(['claude=a', 'codex=b']).firstTool()).toBe('claude');
		expect(ProfileAliases.parse(['codex=b']).firstTool()).toBe('codex');
	});

	it('describes itself without any host profile name', () => {
		expect(ProfileAliases.parse(['claude=secret-host', 'codex=other-host']).describe()).toBe(
			'per-tool aliases: claude, codex'
		);
		expect(ProfileAliases.parse(['work=secret-host']).describe()).toBe(
			'one alias "work" for every tool (claude, codex, opencode)'
		);
	});
});
