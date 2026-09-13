import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveOwnBundlePath } from './resolveOwnBundlePath';

describe('resolveOwnBundlePath', () => {
	const SELF = 'C:/pkg/flow-cli/dist-bundle/flow.cjs';

	beforeEach(() => {
		delete process.env['LAUNCHER_BUNDLE_OVERRIDE'];
		vi.restoreAllMocks();
	});

	it('falls back to the caller path when no override is set', () => {
		expect(resolveOwnBundlePath('flow.cjs', SELF)).toBe(SELF);
	});

	it('honours an override that points at its own bundle', () => {
		const override = 'C:/App/nodejs/node_modules/@wadeck-app/flow-cli/flow.cjs';
		process.env['LAUNCHER_BUNDLE_OVERRIDE'] = override;

		expect(resolveOwnBundlePath('flow.cjs', SELF)).toBe(override);
	});

	it('matches the expected bundle case-insensitively, as Windows paths do', () => {
		const override = 'C:/App/nodejs/node_modules/@wadeck-app/flow-cli/FLOW.CJS';
		process.env['LAUNCHER_BUNDLE_OVERRIDE'] = override;

		expect(resolveOwnBundlePath('flow.cjs', SELF)).toBe(override);
	});

	it('accepts a Windows-style override path with backslashes', () => {
		const override = 'C:\\App\\nodejs\\node_modules\\@wadeck-app\\flow-cli\\flow.cjs';
		process.env['LAUNCHER_BUNDLE_OVERRIDE'] = override;

		expect(resolveOwnBundlePath('flow.cjs', SELF)).toBe(override);
	});

	// The bug this function exists for: every launcher sets the same variable name, so a CLI
	// spawned from another CLI's process tree inherits a path to a foreign bundle.
	it('ignores an override belonging to another CLI and warns about it', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		process.env['LAUNCHER_BUNDLE_OVERRIDE'] = 'C:/App/nvm/node_modules/@wadeck-app/queue-cli/queue.cjs';

		expect(resolveOwnBundlePath('flow.cjs', SELF)).toBe(SELF);

		const message = warn.mock.calls.map(call => call.join(' ')).join('\n');
		expect(message).toContain('LAUNCHER_BUNDLE_OVERRIDE');
		expect(message).toContain('queue.cjs');
		expect(message).toContain('flow.cjs');
	});

	it('ignores an empty override without warning', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		process.env['LAUNCHER_BUNDLE_OVERRIDE'] = '';

		expect(resolveOwnBundlePath('flow.cjs', SELF)).toBe(SELF);
		expect(warn).not.toHaveBeenCalled();
	});
});
