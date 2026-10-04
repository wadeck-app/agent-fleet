import { describe, expect, it } from 'vitest';

import { workerSatisfiesShell } from './ShellMatcher.js';

describe('workerSatisfiesShell - permissive default when the step requests nothing', () => {
	it('a step with no shellKind runs on a worker with no declared shells', () => {
		expect(workerSatisfiesShell(undefined, [])).toBe(true);
	});

	it('a step with no shellKind runs on a worker with declared shells', () => {
		expect(workerSatisfiesShell(undefined, ['bash', 'pwsh'])).toBe(true);
	});
});

describe('workerSatisfiesShell - matching a declared shellKind', () => {
	it('accepts a worker that declared the requested shell', () => {
		expect(workerSatisfiesShell('bash', ['bash', 'pwsh'])).toBe(true);
	});

	it('rejects a worker that did not declare the requested shell', () => {
		expect(workerSatisfiesShell('pwsh', ['bash', 'cmd'])).toBe(false);
	});

	it('rejects a worker with no declared shells when the step requires one', () => {
		expect(workerSatisfiesShell('bash', [])).toBe(false);
	});
});
