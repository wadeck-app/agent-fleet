import { execFile } from 'node:child_process';
import * as http from 'node:http';
import * as https from 'node:https';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type HookEvent =
	| 'onFlowStart'
	| 'onFlowEnd'
	| 'onFlowError'
	| 'onStepStart'
	| 'onStepEnd'
	| 'onStepFailed'
	| 'onTaskCreated'
	| 'onStatusChange';

export interface CliHook {
	type: 'cli';
	command: string;
	args: string[];
}

export interface HttpHook {
	type: 'http';
	url: string;
	method?: 'GET' | 'POST';
	headers?: Record<string, string>;
}

// D32: per-listener on-failure behavior (fail-task) is not implemented in v1.
// All hook failures are silently ignored (default: on-failure: ignore). Tracked for v2.
export type HookConfig = CliHook | HttpHook;

export class HookDispatcher {
	constructor(private readonly hooks: Record<string, HookConfig[]>) {}

	async dispatch(event: HookEvent, payload: Record<string, unknown>): Promise<void> {
		const hookList = this.hooks[event] ?? [];
		await Promise.all(hookList.map(hook => this.runHook(hook, payload)));
	}

	private async runHook(hook: HookConfig, payload: Record<string, unknown>): Promise<void> {
		switch (hook.type) {
			case 'cli':
				await this.sendCliHook(hook, payload);
				return;
			case 'http':
				await this.sendHttpHook(hook, payload);
				return;
			default: {
				const _exhaustive: never = hook;
				throw new Error(`Unknown hook type: ${JSON.stringify(_exhaustive)}`);
			}
		}
	}

	private sendCliHook(hook: CliHook, payload: Record<string, unknown>): Promise<void> {
		const env: Record<string, string> = {};
		for (const [key, val] of Object.entries(payload)) {
			const envKey = key.replace(/([A-Z])/g, '_$1').toUpperCase();
			env[envKey] = val !== null && val !== undefined ? String(val) : '';
		}
		return execFileAsync(hook.command, hook.args, { env: { ...process.env, ...env }, timeout: 10_000 }).then(() => undefined);
	}

	private async sendHttpHook(hook: HttpHook, payload: Record<string, unknown>): Promise<void> {
		return new Promise((resolve, reject) => {
			const body = JSON.stringify(payload);
			const url = new URL(hook.url);
			const options = {
				hostname: url.hostname,
				port: url.port || (url.protocol === 'https:' ? 443 : 80),
				path: url.pathname + url.search,
				method: hook.method ?? 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(body),
					...hook.headers,
				},
			};
			const transport = url.protocol === 'https:' ? https : http;
			const req = transport.request(options, res => {
				res.on('data', () => {});
				res.on('end', resolve);
			});
			req.on('error', reject);
			req.setTimeout(10_000, () => req.destroy());
			req.write(body);
			req.end();
		});
	}
}
