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
	/** sha256 of the registration token. The secret itself is never stored (T-09). */
	tokenHash: string;
	createdAt: string;
}

/** What the caller supplies to declare a source. */
export interface WorkerSourceDeclaration {
	sourceId: string;
	provider: string;
	options?: Record<string, unknown>;
	labels: string[];
	maxWorkers: number;
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
	declare(declaration: WorkerSourceDeclaration): { token: string; entry: WorkerSourceEntry } {
		this.validate(declaration);

		const sources = this.read();
		if (sources.some(s => s.sourceId === declaration.sourceId)) {
			throw new Error(
				`Worker source "${declaration.sourceId}" is already declared. Remove it first, or choose another id.`
			);
		}

		const token = randomBytes(32).toString('hex');
		const entry: WorkerSourceEntry = {
			sourceId: declaration.sourceId,
			provider: declaration.provider,
			...(declaration.options ? { options: declaration.options } : {}),
			labels: [...declaration.labels],
			maxWorkers: declaration.maxWorkers,
			tokenHash: hashToken(token),
			createdAt: new Date().toISOString(),
		};

		this.write([...sources, entry]);
		return { token, entry };
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
	 * Confirms a presented token belongs to the named source.
	 *
	 * Compared in constant time so a wrong token cannot be recovered byte by byte from
	 * response timing.
	 */
	verifyToken(sourceId: string, token: string): boolean {
		const entry = this.find(sourceId);
		if (entry === undefined) return false;

		const presented = Buffer.from(hashToken(token), 'hex');
		const stored = Buffer.from(entry.tokenHash, 'hex');
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

function hashToken(token: string): string {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}
