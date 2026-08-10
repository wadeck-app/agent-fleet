import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runTaskCommand } from './TaskIndex.js';

let tmpDir: string;

beforeEach(() => {
	tmpDir = path.join(os.tmpdir(), `task-cli-test-${crypto.randomUUID()}`);
	fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runTaskCommand', () => {
	describe('task new', () => {
		it('creates a task and returns JSON with id, title, status', async () => {
			const result = await runTaskCommand(['new', 'My task'], tmpDir);
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.output);
			expect(parsed.id).toMatch(/^[a-z0-9]{8}$/);
			expect(parsed.title).toBe('My task');
			expect(parsed.status).toBe('created');
		});

		it('returns exit code 1 with error when no description given', async () => {
			const result = await runTaskCommand(['new'], tmpDir);
			expect(result.exitCode).toBe(1);
			const parsed = JSON.parse(result.output);
			expect(parsed.error).toContain('Missing description');
		});
	});

	describe('task list', () => {
		it('returns empty array when no tasks exist', async () => {
			const result = await runTaskCommand(['list'], tmpDir);
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.output);
			expect(parsed).toEqual([]);
		});

		it('returns array of task summaries after creating tasks', async () => {
			await runTaskCommand(['new', 'Task A'], tmpDir);
			await runTaskCommand(['new', 'Task B'], tmpDir);
			const result = await runTaskCommand(['list'], tmpDir);
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.output);
			expect(parsed).toHaveLength(2);
			expect(parsed.map((t: { title: string }) => t.title)).toContain('Task A');
			expect(parsed.map((t: { title: string }) => t.title)).toContain('Task B');
		});
	});

	describe('task show', () => {
		it('returns full task JSON for valid id', async () => {
			const created = await runTaskCommand(['new', 'Show me'], tmpDir);
			const task = JSON.parse(created.output);
			const result = await runTaskCommand(['show', task.id], tmpDir);
			expect(result.exitCode).toBe(0);
			const shown = JSON.parse(result.output);
			expect(shown.id).toBe(task.id);
			expect(shown.title).toBe('Show me');
			expect(shown.history).toBeDefined();
		});

		it('returns exit code 1 for unknown id', async () => {
			const result = await runTaskCommand(['show', 'nonexistent'], tmpDir);
			expect(result.exitCode).toBe(1);
			const parsed = JSON.parse(result.output);
			expect(parsed.error).toContain('Task not found');
		});

		it('returns exit code 1 when no id given', async () => {
			const result = await runTaskCommand(['show'], tmpDir);
			expect(result.exitCode).toBe(1);
			const parsed = JSON.parse(result.output);
			expect(parsed.error).toContain('Missing id');
		});
	});

	describe('task approve', () => {
		it('sets task status to approved', async () => {
			const created = await runTaskCommand(['new', 'Approve me'], tmpDir);
			const task = JSON.parse(created.output);
			const result = await runTaskCommand(['approve', task.id], tmpDir);
			expect(result.exitCode).toBe(0);
			const approved = JSON.parse(result.output);
			expect(approved.status).toBe('approved');
		});

		it('returns exit code 1 for unknown id', async () => {
			const result = await runTaskCommand(['approve', 'badid'], tmpDir);
			expect(result.exitCode).toBe(1);
			const parsed = JSON.parse(result.output);
			expect(parsed.error).toContain('Task not found');
		});
	});

	describe('task set-status', () => {
		it('sets task status to done', async () => {
			const created = await runTaskCommand(['new', 'Set status'], tmpDir);
			const task = JSON.parse(created.output);
			const result = await runTaskCommand(['set-status', task.id, 'done'], tmpDir);
			expect(result.exitCode).toBe(0);
			const updated = JSON.parse(result.output);
			expect(updated.status).toBe('done');
		});

		it('sets task status to in-progress', async () => {
			const created = await runTaskCommand(['new', 'In progress'], tmpDir);
			const task = JSON.parse(created.output);
			const result = await runTaskCommand(['set-status', task.id, 'in-progress'], tmpDir);
			expect(result.exitCode).toBe(0);
			expect(JSON.parse(result.output).status).toBe('in-progress');
		});

		it('returns exit code 1 for invalid status', async () => {
			const created = await runTaskCommand(['new', 'Bad status'], tmpDir);
			const task = JSON.parse(created.output);
			const result = await runTaskCommand(['set-status', task.id, 'invalid-status'], tmpDir);
			expect(result.exitCode).toBe(1);
			const parsed = JSON.parse(result.output);
			expect(parsed.error).toContain('Invalid status');
		});

		it('returns exit code 1 when missing arguments', async () => {
			const result = await runTaskCommand(['set-status'], tmpDir);
			expect(result.exitCode).toBe(1);
			const parsed = JSON.parse(result.output);
			expect(parsed.error).toContain('Missing arguments');
		});

		it('returns exit code 1 for unknown task id', async () => {
			const result = await runTaskCommand(['set-status', 'badid', 'done'], tmpDir);
			expect(result.exitCode).toBe(1);
			const parsed = JSON.parse(result.output);
			expect(parsed.error).toContain('Task not found');
		});
	});

	describe('unknown command', () => {
		it('returns exit code 1 with error for unknown command', async () => {
			const result = await runTaskCommand(['delete'], tmpDir);
			expect(result.exitCode).toBe(1);
			const parsed = JSON.parse(result.output);
			expect(parsed.error).toContain('Unknown command');
		});
	});

	describe('no command', () => {
		it('returns exit code 0 with usage text when no args given', async () => {
			const result = await runTaskCommand([], tmpDir);
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain('Usage:');
		});

		it('returns exit code 0 with usage text for --help', async () => {
			const result = await runTaskCommand(['--help'], tmpDir);
			expect(result.exitCode).toBe(0);
			expect(result.output).toContain('Usage:');
		});
	});
});
