import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REGISTRY_FILE = 'worker-sources.json';

/** A declared source of workers. Persisted; never proof that a worker exists. */
export interface WorkerSourceEntry {
	sourceId: string;
	/** The S1 implementation that obtains workers for this source. */
	provider: string;
	/** Options handed to that implementation. */
	options?: Record<string, unknown>;
	/** Labels every worker from this source inherits (D#30). */
	labels: string[];
	/** Upper bound on workers this source may supply, so one cannot absorb every step (D#64). */
	maxWorkers: number;
	/** sha256 of the token a *worker* from this source presents. Never the secret (T-09). */
	tokenHash: string;
	/**
	 * sha256 of the token the *source itself* presents when it registers (T-04, T-11).
	 *
	 * Deliberately a second secret rather than a reuse of `tokenHash`. A fake worker absorbs
	 * one step; a fake source manufactures capacity wholesale across every project, so a
	 * stolen worker credential must not be promotable into that role.
	 *
	 * Optional only because an entry written before the split has none. Absent means "cannot
	 * register as a source" -- never "any token matches".
	 */
	sourceTokenHash?: string;
	createdAt: string;
	/**
	 * Process of a worker that declared *itself* -- D#5's first kind of entry, "a worker already
	 * alive and waiting to be contacted".
	 *
	 * Present only for such an entry, and it is what makes one safely prunable: a worker killed
	 * without a chance to clean up would otherwise leave declared capacity behind forever. Absent
	 * means the entry describes a machine or a command, where no local pid could speak for it.
	 */
	pid?: number;
}

/** What the caller supplies to declare a source. */
export interface WorkerSourceDeclaration {
	sourceId: string;
	provider: string;
	options?: Record<string, unknown>;
	labels: string[];
	maxWorkers: number;
	/** Process that declared itself; see {@link WorkerSourceEntry.pid}. */
	pid?: number;
}

interface RegistryFile {
	sources: WorkerSourceEntry[];
}

/**
 * The sources a user has declared, persisted under the flow config directory.
 *
 * Carries **intent and discovery only**. It is never authoritative for availability:
 * a live connection is the sole proof that a worker exists (D#4), and dispatch targets
 * nothing else. A stale entry therefore cannot cause a phantom dispatch -- which is why
 * T-10 is closed by design rather than by expiring entries.
 *
 * Each entry is bound to a registration token so a source cannot be impersonated by
 * appending to the file (T-09). Only the hash is stored; the secret is shown once at
 * declaration. File-permission hardening is deliberately not attempted: a same-user
 * process already reads the config, the execution store and provider credentials from
 * this same directory, so locking one file moves no boundary (accepted risk).
 */
export class WorkerSourceRegistry {
	private readonly filePath: string;

	constructor(private readonly configDir: string) {
		this.filePath = join(configDir, REGISTRY_FILE);
	}

	/**
	 * Records a source and returns its registration token.
	 *
	 * The token is returned once and never recoverable afterwards, so the caller must
	 * surface it immediately.
	 */
	declare(declaration: WorkerSourceDeclaration): { token: string; sourceToken: string; entry: WorkerSourceEntry } {
		this.validate(declaration);

		const sources = this.read();
		if (sources.some(s => s.sourceId === declaration.sourceId)) {
			throw new Error(
				`Worker source "${declaration.sourceId}" is already declared. Remove it first, or choose another id.`
			);
		}

		const token = randomBytes(32).toString('hex');
		// Independent secret, not derived from the worker token: deriving one from the other
		// would mean holding either implies holding both, which is the thing being prevented.
		const sourceToken = randomBytes(32).toString('hex');
		const entry: WorkerSourceEntry = {
			sourceId: declaration.sourceId,
			provider: declaration.provider,
			...(declaration.options ? { options: declaration.options } : {}),
			labels: [...declaration.labels],
			maxWorkers: declaration.maxWorkers,
			...(declaration.pid !== undefined ? { pid: declaration.pid } : {}),
			tokenHash: hashToken(token),
			sourceTokenHash: hashToken(sourceToken),
			createdAt: new Date().toISOString(),
		};

		this.write([...sources, entry]);
		return { token, sourceToken, entry };
	}

	list(): WorkerSourceEntry[] {
		return this.read();
	}

	find(sourceId: string): WorkerSourceEntry | undefined {
		return this.read().find(s => s.sourceId === sourceId);
	}

	/** Returns false when the source was not declared, so the caller can report it. */
	remove(sourceId: string): boolean {
		const sources = this.read();
		const remaining = sources.filter(s => s.sourceId !== sourceId);
		if (remaining.length === sources.length) return false;
		this.write(remaining);
		return true;
	}

	/**
	 * Drops entries whose declaring process is gone, returning the ids removed.
	 *
	 * Only entries carrying a `pid` are candidates: a worker that declared itself and was then
	 * killed cannot clean up after itself, and declared capacity that can never appear is worse than
	 * none -- it is read as "something exists" by anyone looking. Entries without a pid describe a
	 * machine or a command and are never touched.
	 */
	pruneDead(): string[] {
		const sources = this.read();
		const removed: string[] = [];
		const remaining = sources.filter(source => {
			if (source.pid === undefined || isProcessAlive(source.pid)) return true;
			removed.push(source.sourceId);
			return false;
		});
		if (removed.length > 0) this.write(remaining);
		return removed;
	}

	/**
	 * Confirms a presented token belongs to the named source.
	 *
	 * Compared in constant time so a wrong token cannot be recovered byte by byte from
	 * response timing.
	 */
	verifyToken(sourceId: string, token: string): boolean {
		return this.matches(this.find(sourceId)?.tokenHash, token);
	}

	/**
	 * Confirms a presented token authorises registering *as* the named source (T-04, T-11).
	 *
	 * A worker credential never passes here and this one never passes `verifyToken`: the two
	 * hashes are independent secrets, so compromising one role does not grant the other.
	 */
	verifySourceToken(sourceId: string, token: string): boolean {
		return this.matches(this.find(sourceId)?.sourceTokenHash, token);
	}

	/**
	 * Constant-time comparison against a stored hash.
	 *
	 * An absent hash is a refusal, never a match -- an entry predating the source credential
	 * simply cannot act as a source, which is the safe reading of missing data.
	 */
	private matches(storedHash: string | undefined, token: string): boolean {
		if (storedHash === undefined) return false;

		const presented = Buffer.from(hashToken(token), 'hex');
		const stored = Buffer.from(storedHash, 'hex');
		if (presented.length !== stored.length) return false;
		return timingSafeEqual(presented, stored);
	}

	private validate(declaration: WorkerSourceDeclaration): void {
		if (typeof declaration.sourceId !== 'string' || declaration.sourceId.trim() === '') {
			throw new Error('Worker source sourceId must be a non-empty string');
		}
		if (typeof declaration.provider !== 'string' || declaration.provider.trim() === '') {
			throw new Error(`Worker source "${declaration.sourceId}" must name a provider`);
		}
		if (!Number.isInteger(declaration.maxWorkers) || declaration.maxWorkers < 1) {
			throw new Error(
				`Worker source "${declaration.sourceId}" maxWorkers must be a positive integer, got ${JSON.stringify(declaration.maxWorkers)}. An unbounded source could absorb every dispatched step.`
			);
		}
		if (!Array.isArray(declaration.labels)) {
			throw new Error(
				`Worker source "${declaration.sourceId}" labels must be a list, e.g. ["gpu", "linux"], got ${typeof declaration.labels}`
			);
		}
		for (const label of declaration.labels) {
			if (typeof label !== 'string' || label.trim() === '') {
				throw new Error(
					`Worker source "${declaration.sourceId}" labels must all be non-empty strings, got ${JSON.stringify(label)}`
				);
			}
		}
		this.validateCommandOptions(declaration);
	}

	/**
	 * Checks a `built-in:command` entry can actually produce a worker, at declaration time.
	 *
	 * Without this the entry was accepted and only failed later, inside the daemon, when a step
	 * needed capacity -- reported on the daemon's stderr, where the person who declared the source
	 * is not looking. The reverse case is refused for the same reason: a command attached to a
	 * provider that never runs one is configuration that looks applied and is not.
	 */
	private validateCommandOptions(declaration: WorkerSourceDeclaration): void {
		const command = declaration.options?.command;
		const isCommandProvider = declaration.provider === 'built-in:command';

		if (isCommandProvider && (typeof command !== 'string' || command.trim() === '')) {
			throw new Error(
				`Worker source "${declaration.sourceId}" uses built-in:command but declares no command to run. ` +
					'Pass --command "<how to launch a worker>", e.g. --command "flow worker --source ' +
					`${declaration.sourceId} --token <worker token>".`
			);
		}
		if (!isCommandProvider && command !== undefined) {
			throw new Error(
				`Worker source "${declaration.sourceId}" declares a command, but provider "${declaration.provider}" never runs one. ` +
					'Use --provider built-in:command to have the daemon launch a worker itself.'
			);
		}
	}

	/**
	 * Reads the registry, treating a damaged file as an error.
	 *
	 * A corrupt file is never read as "nothing declared": that would silently discard
	 * every source the user set up and look like a configuration that never existed.
	 */
	private read(): WorkerSourceEntry[] {
		if (!existsSync(this.filePath)) return [];

		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
		} catch (err) {
			throw new Error(`Failed to parse worker source registry at "${this.filePath}": ${String(err)}`);
		}

		const sources = (parsed as RegistryFile | null)?.sources;
		if (!Array.isArray(sources)) {
			throw new Error(
				`Worker source registry at "${this.filePath}" is malformed: expected a "sources" list, got ${typeof sources}`
			);
		}
		return sources;
	}

	private write(sources: WorkerSourceEntry[]): void {
		mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
		const payload: RegistryFile = { sources };
		writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
	}
}

/**
 * Whether a pid still names a running process.
 *
 * `kill(pid, 0)` sends no signal; it only asks. EPERM means the process exists but belongs to
 * someone else, which is still "alive" for this purpose -- treating it as dead would drop a live
 * worker's entry.
 */
function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === 'EPERM';
	}
}

function hashToken(token: string): string {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}
