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
	it('fails with actionable message when project not initialized', async () => {
		const result = await runTaskCommand(['list'], tmpDir);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain('task init');
	});

	it('list, new, show, approve, set-status all require init', async () => {
		const commands = [
			['list'],
			['new', 'test task'],
			['show', 'abc123'],
			['approve', 'abc123'],
			['set-status', 'abc123', 'done'],
		];
		for (const cmd of commands) {
			const result = await runTaskCommand(cmd, tmpDir);
			expect(result.exitCode, `command "${cmd[0]}" should require init`).toBe(1);
			expect(result.output).toContain('task init');
		}
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
