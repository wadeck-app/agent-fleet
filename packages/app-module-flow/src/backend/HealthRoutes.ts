import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { type FlowQueryService, errorMessage, logsDirOf } from 'flow-core';
import { readdirSync } from 'node:fs';

/** Longest a single check may take: the whole route answers in about this time, the checks run together. */
export const HEALTH_CHECK_TIMEOUT_MS = 2000;

export interface HealthCheck {
	name: string;
	ok: boolean;
	detail?: string;
}

type CheckOutcome = Omit<HealthCheck, 'name'>;

/** Runs one check; a throw or a check slower than `timeoutMs` is a failed check named after the path or the daemon, never a 5xx. */
async function runCheck(
	name: string,
	timeoutMs: number,
	check: () => Promise<CheckOutcome> | CheckOutcome
): Promise<HealthCheck> {
	let timer: NodeJS.Timeout | undefined;
	try {
		const timeout = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(
				() => reject(new Error(`the ${name} check did not answer within ${timeoutMs} ms`)),
				timeoutMs
			);
		});
		const outcome = await Promise.race([Promise.resolve().then(check), timeout]);
		return { name, ...outcome };
	} catch (err) {
		return { name, ok: false, detail: errorMessage(err) };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * `GET /health` (app-core-cli update test, not a page source): read-only checks of what the pages rely on. The detail of a
 * failure names the path and the error text, never a file content. A daemon that is not running is normal (it stops itself
 * when idle); one that runs and does not answer a read query is a failure.
 */
export function registerHealthRoutes(
	ctx: ModuleContext,
	service: FlowQueryService,
	timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS
): void {
	const { configDir } = service.directories;

	ctx.registerRoute('GET', '/health', async (_req, reply) => {
		const checks = await Promise.all([
			runCheck('config-dir', timeoutMs, () => {
				try {
					readdirSync(configDir);
				} catch (err) {
					return {
						ok: false,
						detail: `Cannot read the flow config directory ${configDir}: ${errorMessage(err)}`,
					};
				}
				return { ok: true };
			}),
			// Only the folder is listed: `service.listExecutions` reads and parses every execution file synchronously (seconds
			// with a thousand runs), which blocks the app-core process and made the first call exceed the check timeout.
			runCheck('executions-store', timeoutMs, () => {
				const { executionsDir } = service.directories;
				try {
					readdirSync(executionsDir);
				} catch (err) {
					if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
						return { ok: true, detail: 'no execution yet' };
					}
					return {
						ok: false,
						detail: `Cannot read the executions in ${executionsDir}: ${errorMessage(err)}`,
					};
				}
				return { ok: true };
			}),
			runCheck('logs-dir', timeoutMs, () => {
				const logsDir = logsDirOf(configDir);
				try {
					readdirSync(logsDir);
				} catch (err) {
					if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
						return { ok: true, detail: 'no log yet' };
					}
					return { ok: false, detail: `Cannot read the logs directory ${logsDir}: ${errorMessage(err)}` };
				}
				return { ok: true };
			}),
			runCheck('daemon', timeoutMs, async () => {
				try {
					const { daemon } = await service.listWorkers();
					return daemon.running
						? { ok: true }
						: { ok: true, detail: 'daemon not running (it stops itself when idle)' };
				} catch (err) {
					return {
						ok: false,
						detail: `The running daemon did not answer the workers query: ${errorMessage(err)}`,
					};
				}
			}),
		]);
		return reply.code(200).send({ ok: checks.every(check => check.ok), checks });
	});
}
