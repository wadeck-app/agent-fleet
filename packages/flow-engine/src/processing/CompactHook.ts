import { DefaultProcessLauncher } from './DefaultProcessLauncher';
import type { ProcessLauncher } from './ProcessLauncher';
import type { StreamJsonEvent } from './StreamJsonParser';

export const DEFAULT_COMPACT_HOOK_TIMEOUT_SECONDS = 30;

/**
 * A context-compaction occurrence seen in Claude's stream-json. Deliberately omits the
 * compaction summary: it is large and may contain secrets.
 */
export type CompactEvent =
	| { event: 'success'; trigger?: string; preTokens?: number; postTokens?: number; durationMs?: number }
	| { event: 'failed'; error?: string }
	| { event: 'thrashing' };

export interface OnCompactConfig {
	/** Shell command, run in the step's working directory. */
	command: string;
	/** Seconds before the command is killed. Default 30. */
	timeout?: number;
}

/** Throws an actionable error for an `onCompact` the step cannot honour. */
export function validateOnCompact(params: { onCompact: OnCompactConfig; provider: string }): void {
	const { onCompact, provider } = params;
	if (provider !== 'claude') {
		throw new Error(
			`onCompact is only supported on provider 'claude', but this step uses '${provider}'. Compaction events come from Claude Code's stream-json; remove onCompact or switch the step to provider claude.`
		);
	}
	if (typeof onCompact.command !== 'string' || onCompact.command.trim() === '') {
		throw new Error('onCompact.command must be a non-empty shell command.');
	}
	const timeout = onCompact.timeout;
	if (timeout !== undefined && (!Number.isInteger(timeout) || timeout <= 0)) {
		throw new Error(`onCompact.timeout must be a positive integer number of seconds, got ${String(timeout)}.`);
	}
}

/** Recognizes the three compaction-related stream events; undefined for anything else. */
export function extractCompactEvent(event: StreamJsonEvent): CompactEvent | undefined {
	if (event.type === 'system' && event.subtype === 'compact_boundary') {
		const meta = (event.data.compact_metadata ?? {}) as Record<string, unknown>;
		return {
			event: 'success',
			...(typeof meta['trigger'] === 'string' ? { trigger: meta['trigger'] } : {}),
			...(typeof meta['pre_tokens'] === 'number' ? { preTokens: meta['pre_tokens'] } : {}),
			...(typeof meta['post_tokens'] === 'number' ? { postTokens: meta['post_tokens'] } : {}),
			...(typeof meta['duration_ms'] === 'number' ? { durationMs: meta['duration_ms'] } : {}),
		};
	}
	if (event.type === 'system' && event.data.compact_result === 'failed') {
		const error = event.data.compact_error;
		return { event: 'failed', ...(typeof error === 'string' ? { error } : {}) };
	}
	if (event.type === 'result' && event.data.terminal_reason === 'rapid_refill_breaker') {
		return { event: 'thrashing' };
	}
	return undefined;
}

export function buildCompactHookEnv(event: CompactEvent): Record<string, string> {
	const env: Record<string, string> = { FLOW_COMPACT_EVENT: event.event };
	if (event.event === 'success') {
		if (event.trigger !== undefined) env['FLOW_COMPACT_TRIGGER'] = event.trigger;
		if (event.preTokens !== undefined) env['FLOW_COMPACT_PRE_TOKENS'] = String(event.preTokens);
		if (event.postTokens !== undefined) env['FLOW_COMPACT_POST_TOKENS'] = String(event.postTokens);
	}
	if (event.event === 'failed' && event.error !== undefined) env['FLOW_COMPACT_ERROR'] = event.error;
	return env;
}

function buildStdinPayload(event: CompactEvent, context: { stepId: string; taskId?: string }): string {
	const payload: Record<string, unknown> = { event: event.event, stepId: context.stepId };
	if (context.taskId !== undefined) payload['taskId'] = context.taskId;
	if (event.event === 'success') {
		if (event.trigger !== undefined) payload['trigger'] = event.trigger;
		if (event.preTokens !== undefined) payload['pre_tokens'] = event.preTokens;
		if (event.postTokens !== undefined) payload['post_tokens'] = event.postTokens;
		if (event.durationMs !== undefined) payload['duration_ms'] = event.durationMs;
	}
	if (event.event === 'failed' && event.error !== undefined) payload['error'] = event.error;
	return JSON.stringify(payload);
}

/**
 * Runs the user's command for one compaction event. An observer only: a non-zero exit, a timeout
 * or a spawn error is reported through `onWarning` and never thrown, so it can neither fail the
 * step nor block a compaction. Resolves once the command has ended or been killed.
 */
export function runCompactHook(params: {
	command: string;
	timeoutMs: number;
	cwd: string;
	env: Record<string, string>;
	event: CompactEvent;
	context: { stepId: string; taskId?: string };
	onWarning: (message: string) => void;
	/** Spawns the command and ends its tree. Default: the host implementation. */
	launcher?: ProcessLauncher;
}): Promise<void> {
	const { command, timeoutMs, cwd, env, event, context, onWarning } = params;
	const launcher = params.launcher ?? new DefaultProcessLauncher();
	const label = `onCompact command for step '${context.stepId}'`;

	return new Promise(resolve => {
		let settled = false;
		const finish = (): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve();
		};

		// No windowsHide: it would strip the console handle and make the command's own children
		// allocate a visible console (see commit d032e7e).
		// violations-suppress: cli/no-spawn-without-windows-hide windowsHide strips the console handle, so the command's children allocate a visible console -- see d032e7e
		const child = launcher.spawn(command, {
			cwd,
			env: { ...env, ...buildCompactHookEnv(event) },
			shell: true,
			stdio: ['pipe', 'ignore', 'pipe'],
			// Own process group on POSIX so a timeout can kill the whole tree. Not on Windows:
			// DETACHED_PROCESS has the same console-handle problem as windowsHide (see above).
			detached: process.platform !== 'win32',
		});

		let stderr = '';
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			onWarning(`${label} timed out after ${String(timeoutMs / 1000)}s and was killed.`);
			void launcher.killTreeAndWait(child).then(finish);
		}, timeoutMs);

		child.on('error', err => {
			onWarning(`${label} could not be started: ${err.message}`);
			finish();
		});
		child.on('close', code => {
			if (settled || timedOut) return;
			if (code !== 0) {
				const detail = stderr.trim() === '' ? '' : `: ${stderr.trim()}`;
				onWarning(`${label} exited with code ${String(code)}${detail}`);
			}
			finish();
		});

		// A command that never reads stdin closes it early; that must not surface as an error.
		child.stdin?.on('error', () => {});
		child.stdin?.end(buildStdinPayload(event, context));
	});
}
