/**
 * The flow editor (web frontend) imports the flow validator in the browser, where `process` and `node:path` do
 * not exist. Evaluating these modules must not throw, and the opencode shell check must stay silent there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Evaluates the module graph with `process` undefined, then restores it right away (vitest's own RPC needs
 * `process.nextTick`, so it must not stay stubbed across awaits other than the import itself).
 */
async function importWithoutProcess<T>(load: () => Promise<T>): Promise<T> {
	// Warm the transform cache first: vitest's module fetch RPC itself uses `process.nextTick`.
	await load();
	vi.resetModules();
	vi.stubGlobal('process', undefined);
	try {
		return await load();
	} finally {
		vi.unstubAllGlobals();
	}
}

describe('OpenCodeWindowsShell without a Node `process` (browser)', () => {
	afterEach(() => {
		vi.resetModules();
	});

	it('loads without throwing and resolves to not-applicable', async () => {
		const mod = await importWithoutProcess(() => import('./OpenCodeWindowsShell'));
		expect(mod.defaultOpenCodeShellProbe.platform).toBe('browser');
		vi.stubGlobal('process', undefined);
		try {
			expect(mod.resolveOpenCodeShell({})).toEqual({ kind: 'not-applicable' });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('loads the semantic validator and reports no opencode shell issue', async () => {
		const { SemanticValidator } = await importWithoutProcess(() => import('../validation/SemanticValidator'));
		const issues: { code: string }[] = [];
		const collector = { addIssue: (issue: { code: string }) => issues.push(issue) };
		const validator = new SemanticValidator(collector as never, {} as never);
		const flow = {
			id: 'f',
			steps: [{ type: 'model', id: 's1', name: 'S1', provider: 'opencode', prompt: 'x' }],
		};
		validator.validateSemantics(flow as never, new Set(['s1']));
		expect(issues.filter(issue => issue.code === 'OPENCODE_SHELL_NOT_FOUND')).toEqual([]);
	});
});

describe('OpenCodeWindowsShell with an injected probe (host behaviour unchanged)', () => {
	it('win32 still resolves a Git Bash path', async () => {
		const { resolveOpenCodeShell } = await import('./OpenCodeWindowsShell');
		const shell = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe';
		expect(resolveOpenCodeShell({}, { platform: 'win32', findGitBash: () => shell })).toEqual({
			kind: 'set',
			shell,
		});
	});

	it('linux stays not-applicable', async () => {
		const { resolveOpenCodeShell } = await import('./OpenCodeWindowsShell');
		expect(resolveOpenCodeShell({}, { platform: 'linux', findGitBash: () => 'x' })).toEqual({
			kind: 'not-applicable',
		});
	});

	it('the default probe reports the Node platform', async () => {
		const { defaultOpenCodeShellProbe } = await import('./OpenCodeWindowsShell');
		expect(defaultOpenCodeShellProbe.platform).toBe(process.platform);
	});
});
