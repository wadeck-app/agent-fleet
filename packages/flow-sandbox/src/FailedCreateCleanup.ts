import { describeError } from './ErrorText';
import { SandboxError } from './SandboxError';
import type { SandboxLog } from './SandboxLog';
import type { SandboxRuntime } from './SandboxRuntime';

/**
 * What to do after `sbx create` fails. A timeout (or a crash of the CLI) says nothing about the VM: sbx may already
 * have created the sandbox, and an unreleased sandbox makes the next create fail with `already-exists`.
 *
 * sbx refuses an existing name at once with `already-exists`, so a sandbox that exists after any OTHER failure was
 * created by the failed call itself: it is removed (best effort, every outcome logged). If it cannot be checked or
 * removed, the name is remembered so that a later `already-exists` is explained as the consequence of the failed
 * create, not as "a leftover from an earlier wrapper".
 */
export class FailedCreateCleanup {
	private readonly uncleaned = new Set<string>();

	constructor(
		private readonly runtime: SandboxRuntime,
		private readonly log: SandboxLog
	) {}

	/** Call after a create failure that is not `already-exists`. Never throws. */
	async afterFailure(name: string, failure: unknown): Promise<void> {
		const cause = describeError(failure);
		try {
			const listed = await this.runtime.list();
			if (!listed.some(info => info.name === name)) {
				this.uncleaned.delete(name);
				this.log.info(
					`Create of sandbox "${name}" failed (${cause}); sbx lists no such sandbox, nothing to clean.`
				);
				return;
			}
			await this.runtime.remove(name);
			this.uncleaned.delete(name);
			this.log.info(`Create of sandbox "${name}" failed (${cause}); the half-created sandbox was removed.`);
		} catch (error) {
			this.uncleaned.add(name);
			const detail = describeError(error);
			this.log.warn(
				`Create of sandbox "${name}" failed (${cause}) and the cleanup failed too: ${detail}. Check with \`leftover list\` and remove it with \`leftover remove ${name}\` before retrying.`
			);
		}
	}

	/** The error for a create that found the name taken. */
	alreadyExists(name: string, cause: SandboxError): SandboxError {
		const reason = this.uncleaned.has(name)
			? `it was probably left by an earlier create of this wrapper that failed and could not be cleaned up`
			: `it is left over from an earlier wrapper with the same id`;
		return new SandboxError(
			'already-exists',
			`Sandbox "${name}" already exists although this worker holds none: ${reason}. Inspect it with \`leftover list\`; once its run is over, remove it with \`leftover remove ${name}\`.`,
			{ sandbox: name, cause }
		);
	}
}
