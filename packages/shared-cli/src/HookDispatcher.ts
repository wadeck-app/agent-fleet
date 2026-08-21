// Hook system for flow and task lifecycle events.
// User-facing documentation, config format, and payload reference: packages/flow-cli/HOOKS.md
// When adding events, transports, or payload fields here, update HOOKS.md accordingly.
import { execFile, spawn } from 'node:child_process';
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
	/**
	 * Environment variables to pass to the hook command.
	 * Only these vars (plus the minimal base env: PATH, HOME, TMPDIR) are forwarded.
	 * The daemon's credentials (ANTHROPIC_API_KEY, etc.) are NOT passed by default.
	 *
	 * Example:
	 *   env:
	 *     SLACK_WEBHOOK_URL: "https://hooks.slack.com/..."
	 *     MY_TOKEN: "env://MY_TOKEN"    # note: URI resolution is not done here — pass the value directly
	 */
	env?: Record<string, string>;
	/**
	 * When true, the hook's stdout and stderr are piped directly to the calling terminal.
	 * Useful for debugging. Do NOT enable in production — output will mix with CLI output.
	 * Default: false.
	 */
	debug?: boolean;
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

	async dispatch(
		event: HookEvent,
		payload: Record<string, unknown>,
		// D32: on-failure default is 'ignore'. onError is called before swallowing so callers
		// can log the failure without changing the swallow-all semantics.
		onError?: (err: unknown) => void
	): Promise<void> {
		const hookList = this.hooks[event] ?? [];
		await Promise.all(
			hookList.map(hook =>
				this.runHook(hook, payload).catch(err => {
					onError?.(err);
				})
			)
		);
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
		// Build camelCase→UPPER_CASE env vars from payload (e.g. executionId → EXECUTION_ID)
		const payloadEnv: Record<string, string> = {};
		for (const [key, val] of Object.entries(payload)) {
			const envKey = key.replace(/([A-Z])/g, '_$1').toUpperCase();
			payloadEnv[envKey] = val !== null && val !== undefined ? String(val) : '';
		}

		// Minimal base env: only what a hook command needs to function.
		// Daemon credentials (ANTHROPIC_API_KEY, etc.) are NOT forwarded.
		// Hook-specific vars must be declared explicitly in hook.env.
		const baseEnv: Record<string, string> = {};
		if (process.env['PATH']) baseEnv['PATH'] = process.env['PATH'];
		if (process.env['HOME']) baseEnv['HOME'] = process.env['HOME'];
		if (process.env['TMPDIR']) baseEnv['TMPDIR'] = process.env['TMPDIR'];
		if (process.env['TEMP']) baseEnv['TEMP'] = process.env['TEMP'];
		if (process.env['TMP']) baseEnv['TMP'] = process.env['TMP'];
		// Windows
		if (process.platform === 'win32') {
			if (process.env['SystemRoot']) baseEnv['SystemRoot'] = process.env['SystemRoot'];
			if (process.env['USERPROFILE']) baseEnv['USERPROFILE'] = process.env['USERPROFILE'];
		}

		const env: Record<string, string> = {
			...baseEnv,
			...payloadEnv,
			...(hook.env ?? {}), // explicit hook-declared vars — highest priority
		};

		if (hook.debug) {
			return this.sendCliHookDebug(hook, env);
		}

		return execFileAsync(hook.command, hook.args, { env, timeout: 10_000 }).then(() => undefined);
	}

	// Runs the CLI hook with stdio: 'inherit' so stdout/stderr appear in the calling terminal.
	// Uses spawn (not execFile) because execFile does not support stdio inheritance.
	private sendCliHookDebug(hook: CliHook, env: Record<string, string>): Promise<void> {
		return new Promise((resolve, reject) => {
			const child = spawn(hook.command, hook.args, { env, stdio: 'inherit' });

			const timer = setTimeout(() => {
				child.kill();
				reject(new Error('CLI hook timeout'));
			}, 10_000);

			child.on('error', err => {
				clearTimeout(timer);
				reject(err);
			});

			child.on('close', code => {
				clearTimeout(timer);
				if (code !== 0) {
					reject(new Error(`Hook exited with code ${String(code)}`));
				} else {
					resolve();
				}
			});
		});
	}

	private async sendHttpHook(hook: HttpHook, payload: Record<string, unknown>): Promise<void> {
		return new Promise((resolve, reject) => {
			// Guard against double-settle: timeout and error event can both fire.
			let settled = false;
			const settle = (fn: () => void): void => {
				if (!settled) {
					settled = true;
					fn();
				}
			};

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
				res.on('end', () => settle(resolve));
			});
			req.on('error', err => settle(() => reject(err)));
			req.setTimeout(10_000, () => {
				req.destroy();
				settle(() => reject(new Error('HTTP hook timeout')));
			});
			req.write(body);
			req.end();
		});
	}
}
