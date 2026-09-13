import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FileApprovalProvider } from './FileApprovalProvider.js';
import { manifest } from './Manifest.js';

let dir: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-approval-manifest-'));
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

/** The factory the plugin loader actually calls, with the options it actually passes. */
function build(options: Record<string, unknown>): FileApprovalProvider {
	const implementation = manifest.implementations['approval']?.['default'];
	if (implementation?.provider === undefined) throw new Error('manifest exposes no approval.default provider');
	return implementation.provider(options) as FileApprovalProvider;
}

describe('plugin manifest', () => {
	// The bug this pins down: the factory ignored its argument, so `options:` in .flow/config.yml
	// was silently dropped and every request landed in the default directory instead of the
	// configured one. Config that is read, accepted and then discarded is worse than unsupported.
	it('passes the configured options through to the provider', () => {
		const provider = build({ dir, timeoutMs: 1234, pollIntervalMs: 7, settleMs: 11 });

		expect(provider.dir).toBe(dir);
		expect(provider.timeoutMs).toBe(1234);
		expect(provider.pollIntervalMs).toBe(7);
		expect(provider.settleMs).toBe(11);
	});

	it('still works when no options are configured', () => {
		const provider = build({});

		expect(provider.dir.length).toBeGreaterThan(0);
	});

	// A typo in config must not look like it was honoured.
	it('rejects an unknown option instead of ignoring it', () => {
		expect(() => build({ dir, timeoutMS: 1000 })).toThrow(/timeoutMS/);
	});

	it('rejects an option of the wrong type', () => {
		expect(() => build({ dir, timeoutMs: '5m' })).toThrow(/timeoutMs/);
	});

	it('declares the approval extension point at a registered version', () => {
		expect(manifest.pluginId).toBe('file-approval');
		expect(manifest.implementations['approval']?.['default']?.version).toBe(1);
	});
});
