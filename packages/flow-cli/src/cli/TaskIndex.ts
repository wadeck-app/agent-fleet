#!/usr/bin/env node
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HookConfig } from '../hooks/HookDispatcher.js';
import { HookDispatcher } from '../hooks/HookDispatcher.js';
import { TaskStore } from '../task/TaskStore.js';
import type { TaskStatus } from '../task/TaskStore.js';

const VALID_STATUSES: TaskStatus[] = [
	'created',
	'elaborating',
	'flow-review',
	'approved',
	'in-progress',
	'failed',
	'done',
];

function isValidStatus(value: string): value is TaskStatus {
	return (VALID_STATUSES as string[]).includes(value);
}

function loadHookDispatcher(cwd: string): HookDispatcher {
	const configPath = path.join(cwd, '.flows', 'config.yml');
	if (fs.existsSync(configPath)) {
		const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
		// Task hooks are under tasks.hooks in config — distinct from top-level hooks: (flow lifecycle hooks)
		const tasksSection = (raw['tasks'] as Record<string, unknown> | undefined) ?? {};
		const hooks = (tasksSection['hooks'] ?? {}) as Record<string, HookConfig[]>;
		return new HookDispatcher(hooks);
	}
	return new HookDispatcher({});
}

export interface CommandResult {
	exitCode: number;
	output: string;
}

export async function runTaskCommand(args: string[], cwd: string): Promise<CommandResult> {
	const command = args[0];

	if (!command || command === '--help') {
		return {
			exitCode: 0,
			output: 'Usage: task <new|list|show|approve|set-status>',
		};
	}

	const tasksDir = path.join(cwd, '.flows', 'tasks');
	const store = new TaskStore(tasksDir);
	const hookDispatcher = loadHookDispatcher(cwd);

	switch (command) {
		case 'new': {
			const description = args[1];
			if (!description) {
				return {
					exitCode: 1,
					output: JSON.stringify({ error: 'Missing description. Usage: task new <description>' }),
				};
			}
			const task = store.create(description);
			await hookDispatcher.dispatch('onTaskCreated', {
				taskId: task.id,
				status: task.status,
				description: task.description,
				taskFile: path.join(tasksDir, `${task.id}.json`),
			});
			return { exitCode: 0, output: JSON.stringify(task, null, 2) };
		}

		case 'list': {
			const tasks = store.list();
			return { exitCode: 0, output: JSON.stringify(tasks, null, 2) };
		}

		case 'show': {
			const id = args[1];
			if (!id) {
				return {
					exitCode: 1,
					output: JSON.stringify({ error: 'Missing id. Usage: task show <id>' }),
				};
			}
			try {
				const task = store.get(id);
				return { exitCode: 0, output: JSON.stringify(task, null, 2) };
			} catch (error) {
				return {
					exitCode: 1,
					output: JSON.stringify({ error: (error as Error).message }),
				};
			}
		}

		case 'approve': {
			const id = args[1];
			if (!id) {
				return {
					exitCode: 1,
					output: JSON.stringify({ error: 'Missing id. Usage: task approve <id>' }),
				};
			}
			try {
				const before = store.get(id);
				const updated = store.updateStatus(id, 'approved');
				await hookDispatcher.dispatch('onStatusChange', {
					taskId: updated.id,
					oldStatus: before.status,
					newStatus: updated.status,
				});
				return { exitCode: 0, output: JSON.stringify(updated, null, 2) };
			} catch (error) {
				return {
					exitCode: 1,
					output: JSON.stringify({ error: (error as Error).message }),
				};
			}
		}

		case 'set-status': {
			const id = args[1];
			const statusArg = args[2];
			if (!id || !statusArg) {
				return {
					exitCode: 1,
					output: JSON.stringify({ error: 'Missing arguments. Usage: task set-status <id> <status>' }),
				};
			}
			if (!isValidStatus(statusArg)) {
				return {
					exitCode: 1,
					output: JSON.stringify({
						error: `Invalid status: ${statusArg}. Valid values: ${VALID_STATUSES.join(', ')}`,
					}),
				};
			}
			try {
				const before = store.get(id);
				const updated = store.updateStatus(id, statusArg);
				await hookDispatcher.dispatch('onStatusChange', {
					taskId: updated.id,
					oldStatus: before.status,
					newStatus: updated.status,
				});
				return { exitCode: 0, output: JSON.stringify(updated, null, 2) };
			} catch (error) {
				return {
					exitCode: 1,
					output: JSON.stringify({ error: (error as Error).message }),
				};
			}
		}

		default:
			return {
				exitCode: 1,
				output: JSON.stringify({
					error: `Unknown command: ${command}. Valid commands: new, list, show, approve, set-status`,
				}),
			};
	}
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const { exitCode, output } = await runTaskCommand(args, process.cwd());
	if (exitCode === 0) {
		process.stdout.write(output + '\n');
	} else {
		process.stderr.write(output + '\n');
	}
	process.exit(exitCode);
}

// Only run main when this file is the entry point, not when imported by tests
const isEntryPoint =
	process.argv[1] !== undefined &&
	(process.argv[1] === fileURLToPath(import.meta.url) ||
		process.argv[1].endsWith('TaskIndex.js') ||
		process.argv[1].endsWith('TaskIndex.ts'));

if (isEntryPoint) {
	main().catch(error => {
		process.stderr.write(JSON.stringify({ error: String(error) }) + '\n');
		process.exit(1);
	});
}
