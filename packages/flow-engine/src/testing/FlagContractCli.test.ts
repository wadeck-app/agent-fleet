/**
 * Parsing of FLAG_CONTRACT_ALLOW_MISSING and the failure message of the flag contract
 * (processing/ProviderFlagContract.test.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ALLOW_MISSING_VARIABLE, announceSkippedOnce, missingCliMessage, readAllowMissing } from './FlagContractCli';

describe('readAllowMissing', () => {
	it('is empty when the variable is unset', async () => {
		expect([...(await readAllowMissing({}))]).toEqual([]);
	});

	it('reads a comma-separated list, trimming blanks', async () => {
		const names = await readAllowMissing({ [ALLOW_MISSING_VARIABLE]: ' opencode , codex,,' });

		expect([...names].sort()).toEqual(['codex', 'opencode']);
	});

	it('rejects an unknown name, so a typo never disables a check', async () => {
		await expect(readAllowMissing({ [ALLOW_MISSING_VARIABLE]: 'opencod' })).rejects.toThrow(
			`${ALLOW_MISSING_VARIABLE}: unknown CLI "opencod" (known: claude, opencode, codex)`
		);
	});
});

describe('missingCliMessage', () => {
	it('names the command, the resolved install and the way to acknowledge the absence', () => {
		const message = missingCliMessage('codex', ['exec', '--help'], 'resolved to codex, --version: unreadable');

		expect(message).toContain('codex exec --help');
		expect(message).toContain('resolved to codex, --version: unreadable');
		expect(message).toContain(`${ALLOW_MISSING_VARIABLE}=codex`);
	});
});

describe('announceSkippedOnce', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('logs a given CLI once, however often it is announced', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		announceSkippedOnce('claude');
		announceSkippedOnce('claude');

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]![0]).toContain('claude NOT VERIFIED');
	});
});
