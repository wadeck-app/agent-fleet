import type { Clock } from './Clock';
import { RunSandboxName } from './RunSandboxName';
import { SandboxError } from './SandboxError';
import type { SandboxLog } from './SandboxLog';
import type { SandboxRuntime } from './SandboxRuntime';
import type { LiveRunCheck } from './WrapperPresence';

export interface LeftoverSandbox {
	name: string;
	wrapperId: string;
	executionId: string;
	/** Raw sbx status. */
	status: string;
	/** Milliseconds since sbx created it; undefined when sbx reported no (or an unreadable) creation time. */
	ageMs: number | undefined;
}

export interface ReapResult {
	/** Sandboxes that were running and are now stopped. */
	stopped: LeftoverSandbox[];
	/** Sandboxes that could not be stopped, with the reason. */
	failed: { sandbox: LeftoverSandbox; reason: string }[];
}

/**
 * The plugin's sandboxes that exist right now, found by the owner marker in the name (RunSandboxName).
 *
 * Nothing here removes anything by itself:
 * - `reportAtStart` only reads and logs;
 * - `reapOwn` STOPS sandboxes of the calling wrapper whose run is not alive (a crashed or restarted wrapper
 *   comes back and finds its own VMs still running); it never removes;
 * - `remove` is the only removal. It is an explicit command that needs the exact sandbox name and is refused
 *   for names without the marker, for a live run and for a live wrapper.
 */
export class LeftoverSandboxes {
	constructor(
		private readonly runtime: SandboxRuntime,
		private readonly clock: Clock,
		private readonly log: SandboxLog,
		private readonly liveness: LiveRunCheck
	) {}

	/** Every sandbox carrying the marker, oldest first. */
	async list(): Promise<LeftoverSandbox[]> {
		const now = this.clock.now();
		const result: LeftoverSandbox[] = [];
		for (const info of await this.runtime.list()) {
			const identity = RunSandboxName.parse(info.name);
			if (identity === undefined) continue;
			const created = info.createdAt === undefined ? Number.NaN : Date.parse(info.createdAt);
			result.push({
				name: info.name,
				wrapperId: identity.wrapperId,
				executionId: identity.executionId,
				status: info.status,
				ageMs: Number.isNaN(created) ? undefined : Math.max(0, now - created),
			});
		}
		return result.sort((a, b) => (b.ageMs ?? -1) - (a.ageMs ?? -1) || a.name.localeCompare(b.name));
	}

	/** Logs what is left (one line each plus the command to remove it) and returns it. */
	async reportAtStart(): Promise<LeftoverSandbox[]> {
		const leftovers = await this.list();
		if (leftovers.length === 0) {
			this.log.info('No leftover plugin sandboxes.');
			return leftovers;
		}
		this.log.warn(
			`${leftovers.length} plugin sandbox(es) exist from earlier runs. They are never removed automatically; remove one whose run is over with \`leftover remove <name>\`.`
		);
		for (const leftover of leftovers) {
			this.log.warn(
				`  ${leftover.name}: wrapper ${leftover.wrapperId}, run ${leftover.executionId}, ${leftover.status}, age ${formatAge(leftover.ageMs)}`
			);
		}
		return leftovers;
	}

	/**
	 * Called by wrapper `wrapperId` at start or contact time: stops its own running sandboxes whose run is not
	 * in `aliveExecutionIds`. Sandboxes of other wrappers, stopped ones and sandboxes of alive runs are untouched.
	 */
	async reapOwn(wrapperId: string, aliveExecutionIds: ReadonlySet<string>): Promise<ReapResult> {
		if (!RunSandboxName.isWrapperId(wrapperId)) {
			throw new SandboxError('invalid-argument', `Wrapper id ${JSON.stringify(wrapperId)} is not valid.`);
		}
		const result: ReapResult = { stopped: [], failed: [] };
		const own = (await this.list()).filter(
			leftover =>
				leftover.wrapperId === wrapperId &&
				leftover.status !== 'stopped' &&
				!aliveExecutionIds.has(leftover.executionId)
		);
		for (const leftover of own) {
			try {
				await this.runtime.stop(leftover.name);
				result.stopped.push(leftover);
				this.log.info(
					`Stopped stale sandbox "${leftover.name}" (run ${leftover.executionId} is not alive); it is not removed.`
				);
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				result.failed.push({ sandbox: leftover, reason });
				this.log.warn(
					`Could not stop stale sandbox "${leftover.name}": ${reason}. Stop it with \`sbx stop ${leftover.name}\`.`
				);
			}
		}
		return result;
	}

	/** Removes exactly the sandbox called `name`, or throws `removal-refused` / `not-found`. */
	async remove(name: string): Promise<void> {
		if (RunSandboxName.parse(name) === undefined) {
			throw new SandboxError(
				'removal-refused',
				`Refusing to remove "${name}": it is not a plugin sandbox (expected the exact name "flow-sbx-<wrapperId>-<executionId>", see \`leftover list\`). Other sandboxes are never touched by this command.`,
				{ sandbox: name }
			);
		}
		const target = (await this.list()).find(leftover => leftover.name === name);
		if (target === undefined) {
			throw new SandboxError(
				'not-found',
				`No plugin sandbox is called "${name}". Check the exact name with \`leftover list\`.`,
				{
					sandbox: name,
				}
			);
		}
		if (this.liveness.isRunAlive(target.executionId)) {
			throw new SandboxError(
				'removal-refused',
				`Refusing to remove "${name}": run ${target.executionId} is still alive. Let it finish or cancel it first; the sandbox is removed automatically when the run ends.`,
				{ sandbox: name }
			);
		}
		if (this.liveness.isWrapperAlive(target.wrapperId)) {
			throw new SandboxError(
				'removal-refused',
				`Refusing to remove "${name}": its wrapper ${target.wrapperId} is still alive and may reuse it. Stop that wrapper first.`,
				{ sandbox: name }
			);
		}
		await this.runtime.remove(name);
		this.log.info(`Removed leftover sandbox "${name}" on explicit request.`);
	}
}

export function formatAge(ageMs: number | undefined): string {
	if (ageMs === undefined) return 'unknown';
	const minutes = Math.floor(ageMs / 60_000);
	if (minutes < 1) return `${Math.floor(ageMs / 1000)}s`;
	if (minutes < 120) return `${minutes}min`;
	const hours = Math.floor(minutes / 60);
	return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}
