import { describe, expect, it } from 'vitest';

import { PROFILE_ALIAS_PATTERN, requireProfileAlias } from './ProfileAlias';
import { failure } from './testing/ExpectedFailures';

describe('requireProfileAlias', () => {
	it('accepts letters, digits, "_" and "-" up to 64 characters and returns the alias unchanged', () => {
		for (const alias of ['claude', 'codex-2', 'A_b-9', 'a'.repeat(64)]) {
			expect(requireProfileAlias(alias), alias).toBe(alias);
			expect(PROFILE_ALIAS_PATTERN.test(alias), alias).toBe(true);
		}
	});

	it('refuses what could break a URL query or an AWS config section', () => {
		for (const alias of ['', 'a'.repeat(65), 'has space', 'a/b', '../x', 'a?b=c', 'é', 'a\nb']) {
			const error = failure(() => requireProfileAlias(alias), JSON.stringify(alias));

			expect(error.kind, alias).toBe('invalid-argument');
			expect(error.message, alias).toContain('use 1 to 64 letters, digits, "_" or "-"');
		}
	});
});
