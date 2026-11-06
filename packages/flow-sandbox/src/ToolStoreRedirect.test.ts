import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { PathTranslator } from './PathTranslator';
import { ToolStoreRedirect } from './ToolStoreRedirect';
import { failure } from './testing/ExpectedFailures';

const thrown = failure;

describe('ToolStoreRedirect with Windows paths', () => {
	const created: string[] = [];
	function redirect(codexDisablePlugins: boolean, meta = 'C:\\Users\\me\\run1.meta'): ToolStoreRedirect {
		return new ToolStoreRedirect({
			translator: new PathTranslator({
				workspaceDir: 'C:\\Users\\me\\run1',
				workspaceMetaDir: 'C:\\Users\\me\\run1.meta',
				platform: 'win32',
			}),
			workspaceMetaDir: meta,
			platform: 'win32',
			codexDisablePlugins,
			makeDirectory: hostPath => void created.push(hostPath),
		});
	}

	afterEach(() => {
		created.length = 0;
	});

	it('puts the Claude config dir under <meta>/sessions/claude, as the sandbox sees it, and creates the host directory', () => {
		const store = redirect(false).prepare('claude');

		expect(store).toEqual({
			tool: 'claude',
			hostDirectory: 'C:\\Users\\me\\run1.meta\\sessions\\claude',
			sandboxDirectory: '/c/Users/me/run1.meta/sessions/claude',
			env: { CLAUDE_CONFIG_DIR: '/c/Users/me/run1.meta/sessions/claude' },
			codexExecOptions: [],
		});
		expect(created).toEqual(['C:\\Users\\me\\run1.meta\\sessions\\claude']);
	});

	it('puts the OpenCode data home under <meta>/sessions/opencode', () => {
		const store = redirect(false).prepare('opencode');

		expect(store.env).toEqual({ XDG_DATA_HOME: '/c/Users/me/run1.meta/sessions/opencode' });
		expect(store.codexExecOptions).toEqual([]);
	});

	it('puts CODEX_HOME under <meta>/sessions/codex, creates it before returning, and passes the settings with -c', () => {
		const store = redirect(false).prepare('codex');

		expect(store.env).toEqual({ CODEX_HOME: '/c/Users/me/run1.meta/sessions/codex' });
		expect(created).toEqual(['C:\\Users\\me\\run1.meta\\sessions\\codex']);
		expect(store.codexExecOptions).toEqual([
			'-c',
			'sandbox_mode="danger-full-access"',
			'-c',
			'approval_policy="never"',
		]);
	});

	it('adds --disable plugins for Codex only when configured', () => {
		const disabled = redirect(true).prepare('codex');
		const claude = redirect(true).prepare('claude');

		expect(disabled.codexExecOptions.slice(-2)).toEqual(['--disable', 'plugins']);
		expect(claude.codexExecOptions).toEqual([]);
	});

	it('refuses an unknown tool before creating anything', () => {
		const error = thrown(() => redirect(false).prepare('gemini'));

		expect(error.message).toContain('Model tool "gemini" is not supported');
		expect(created).toEqual([]);
	});

	it('refuses a meta directory that is not one of the two mounts, creating nothing', () => {
		const error = thrown(() => redirect(false, 'C:\\Elsewhere\\run1.meta').prepare('claude'));

		expect(error.kind).toBe('path-outside-mounts');
		expect(created).toEqual([]);
	});

	it('refuses a meta directory that tries to leave the mounts with ..', () => {
		const error = thrown(() => redirect(false, 'C:\\Users\\me\\run1.meta\\..\\other').prepare('claude'));

		expect(error.kind).toBe('path-outside-mounts');
		expect(created).toEqual([]);
	});
});

describe('ToolStoreRedirect on the real file system', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
	});

	it('creates the Codex store directory (and its parents) on disk, which Codex requires to exist', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandbox-store-'));
		roots.push(root);
		const workspace = path.join(root, 'ws');
		const meta = path.join(root, 'ws.meta');
		const redirect = new ToolStoreRedirect({
			translator: new PathTranslator({
				workspaceDir: workspace,
				workspaceMetaDir: meta,
				platform: process.platform,
			}),
			workspaceMetaDir: meta,
			platform: process.platform,
			codexDisablePlugins: true,
		});

		const store = redirect.prepare('codex');

		expect(store.hostDirectory).toBe(path.join(meta, 'sessions', 'codex'));
		expect(fs.statSync(store.hostDirectory).isDirectory()).toBe(true);
		expect(fs.readdirSync(store.hostDirectory)).toEqual([]);
		expect(() => redirect.prepare('codex')).not.toThrow();
	});
});
