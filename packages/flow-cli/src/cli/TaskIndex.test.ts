import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runTaskCommand } from './TaskIndex.js';

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-index-test-'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runTaskCommand — version and help', () => {
	it('--version returns semver string without requiring project init', async () => {
		const result = await runTaskCommand(['--version'], tmpDir);
		expect(result.exitCode).toBe(0);
		expect(result.output).toMatch(/^\d+\.\d+\.\d+/);
	});

	it('-V returns semver string without requiring project init', async () => {
		const result = await runTaskCommand(['-V'], tmpDir);
		expect(result.exitCode).toBe(0);
		expect(result.output).toMatch(/^\d+\.\d+\.\d+/);
	});

	it('no args returns usage without requiring project init', async () => {
		const result = await runTaskCommand([], tmpDir);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain('Usage:');
	});

	it('--help returns usage without requiring project init', async () => {
		const result = await runTaskCommand(['--help'], tmpDir);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain('Usage:');
	});
});

describe('runTaskCommand — project guard', () => {
	it('fails with human-readable message when project not initialized', async () => {
		const result = await runTaskCommand(['list'], tmpDir);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain('task init');
		expect(result.output).not.toMatch(/^\{/); // not JSON
	});

	it('--json flag returns JSON error', async () => {
		const result = await runTaskCommand(['--json', 'list'], tmpDir);
		expect(result.exitCode).toBe(1);
		const parsed = JSON.parse(result.output) as { error: string };
		expect(parsed.error).toContain('project not initialized');
	});

	it('list, new, show, set-status all require init', async () => {
		const commands = [
			['list'],
			['new', 'test task'],
			['show', 'abc123'],
			['set-status', 'abc123', 'done'],
		];
		for (const cmd of commands) {
			const result = await runTaskCommand(cmd, tmpDir);
			expect(result.exitCode, `command "${cmd[0]}" should require init`).toBe(1);
			expect(result.output).toContain('task init');
		}
	});

	it('approve is no longer a valid command', async () => {
		await runTaskCommand(['init'], tmpDir);
		const result = await runTaskCommand(['approve', 'abc123'], tmpDir);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain('unknown command');
	});
});

describe('runTaskCommand — init', () => {
	it('creates .task/tasks/ and config.yml', async () => {
		const result = await runTaskCommand(['init'], tmpDir);
		expect(result.exitCode).toBe(0);
		expect(fs.existsSync(path.join(tmpDir, '.task', 'tasks'))).toBe(true);
		expect(fs.existsSync(path.join(tmpDir, '.task', 'config.yml'))).toBe(true);
	});

	it('is idempotent — does not fail if already initialized', async () => {
		await runTaskCommand(['init'], tmpDir);
		const result = await runTaskCommand(['init'], tmpDir);
		expect(result.exitCode).toBe(0);
	});

	it('after init, list succeeds', async () => {
		await runTaskCommand(['init'], tmpDir);
		const result = await runTaskCommand(['list'], tmpDir);
		expect(result.exitCode).toBe(0);
	});
});

describe('runTaskCommand — prefix match', () => {
	beforeEach(async () => {
		await runTaskCommand(['init'], tmpDir);
	});

	it('show accepts a full id', async () => {
		const created = await runTaskCommand(['new', 'prefix test'], tmpDir);
		const task = JSON.parse(created.output) as { id: string };
		const result = await runTaskCommand(['show', task.id], tmpDir);
		expect(result.exitCode).toBe(0);
		const shown = JSON.parse(result.output) as { id: string };
		expect(shown.id).toBe(task.id);
	});

	it('show accepts a prefix', async () => {
		const created = await runTaskCommand(['new', 'prefix test'], tmpDir);
		const task = JSON.parse(created.output) as { id: string };
		const prefix = task.id.slice(0, 3);
		const result = await runTaskCommand(['show', prefix], tmpDir);
		expect(result.exitCode).toBe(0);
		const shown = JSON.parse(result.output) as { id: string };
		expect(shown.id).toBe(task.id);
	});

	it('show fails with not found for unknown prefix', async () => {
		const result = await runTaskCommand(['show', 'zzzzz'], tmpDir);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain('not found');
	});

	it('set-status accepts a prefix', async () => {
		const created = await runTaskCommand(['new', 'status test'], tmpDir);
		const task = JSON.parse(created.output) as { id: string };
		const prefix = task.id.slice(0, 4);
		const result = await runTaskCommand(['set-status', prefix, 'in-progress'], tmpDir);
		expect(result.exitCode).toBe(0);
		const updated = JSON.parse(result.output) as { status: string };
		expect(updated.status).toBe('in-progress');
	});
});

describe('runTaskCommand — set-status error messages', () => {
	beforeEach(async () => {
		await runTaskCommand(['init'], tmpDir);
	});

	it('shows human-readable error with Did you mean suggestion', async () => {
		const created = await runTaskCommand(['new', 'typo test'], tmpDir);
		const task = JSON.parse(created.output) as { id: string };
		const result = await runTaskCommand(['set-status', task.id, 'in-progres'], tmpDir);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain('unknown status');
		expect(result.output).toContain('Did you mean: in-progress');
	});

	it('--json returns structured error for invalid status', async () => {
		const created = await runTaskCommand(['new', 'json err test'], tmpDir);
		const task = JSON.parse(created.output) as { id: string };
		const result = await runTaskCommand(['--json', 'set-status', task.id, 'nope'], tmpDir);
		expect(result.exitCode).toBe(1);
		const parsed = JSON.parse(result.output) as { error: string };
		expect(parsed.error).toContain('Invalid status');
	});
});
