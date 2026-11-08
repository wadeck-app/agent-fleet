import { resolveWorkspaceFolder } from 'extension-points';
import { statSync } from 'node:fs';
import * as path from 'node:path';

import { WorkspaceOptionsReader } from './WorkspaceOptionsReader';

const PROVIDER = 'pool';
const ACCEPTED = ['dir', 'prefix', 'count', 'slots', 'requireClean'] as const;
const MAX_COUNT = 1000;
const PLAIN_NAME = /^[a-zA-Z0-9._-]+$/;

/** The options of the `pool` provider, checked. */
export class PoolOptions {
	private constructor(
		private readonly layout:
			{ kind: 'named'; dir: string; prefix: string; count: number } | { kind: 'listed'; slots: string[] },
		readonly requireClean: boolean
	) {}

	/** @throws Error naming the faulty option when the options are not usable. */
	static parse(raw: unknown): PoolOptions {
		const options = new WorkspaceOptionsReader(PROVIDER, ACCEPTED).read(raw);
		const requireClean = WorkspaceOptionsReader.boolean(PROVIDER, 'requireClean', options['requireClean']);
		const namedKeys = ['dir', 'prefix', 'count'].filter(key => options[key] !== undefined);

		if (options['slots'] !== undefined) {
			if (namedKeys.length > 0) {
				throw new Error(
					`Invalid options for workspace provider "pool": give either "slots" or "dir" + "prefix" + "count", not both (found ${namedKeys.map(k => `"${k}"`).join(', ')} next to "slots").`
				);
			}
			const slots = options['slots'];
			if (
				!Array.isArray(slots) ||
				slots.length === 0 ||
				slots.some(slot => typeof slot !== 'string' || slot.trim() === '')
			) {
				throw new Error(
					'Invalid options for workspace provider "pool": "slots" must be a non-empty list of folder paths.'
				);
			}
			return new PoolOptions({ kind: 'listed', slots: slots as string[] }, requireClean);
		}

		if (namedKeys.length === 0) {
			throw new Error(
				'Invalid options for workspace provider "pool": the pool needs either "dir" + "prefix" + "count", or "slots". ' +
					'Example: workspace: { provider: pool, dir: D:/pool, prefix: repo-ws-, count: 4 }.'
			);
		}
		for (const key of ['dir', 'prefix', 'count']) {
			if (options[key] === undefined) {
				throw new Error(
					`Invalid options for workspace provider "pool": "${key}" is missing ("dir", "prefix" and "count" go together).`
				);
			}
		}
		const dir = WorkspaceOptionsReader.string(PROVIDER, 'dir', options['dir'])!;
		const prefix = WorkspaceOptionsReader.string(PROVIDER, 'prefix', options['prefix'])!;
		if (!PLAIN_NAME.test(prefix)) {
			throw new Error(
				`Invalid options for workspace provider "pool": "prefix" must be a plain name (letters, digits, ".", "_" and "-", no path separator), got ${JSON.stringify(prefix)}.`
			);
		}
		const count = WorkspaceOptionsReader.positiveInteger(PROVIDER, 'count', options['count'])!;
		if (count > MAX_COUNT) {
			throw new Error(
				`Invalid options for workspace provider "pool": "count" must be at most ${String(MAX_COUNT)}, got ${String(count)}.`
			);
		}
		return new PoolOptions({ kind: 'named', dir, prefix, count }, requireClean);
	}

	/**
	 * The slot folders for a project, in claim order. Every folder must exist: the provider never creates a slot.
	 *
	 * @throws Error naming the option (or the missing slots and how to create them) when a folder is unusable.
	 */
	slotsFor(projectDir: string): string[] {
		if (this.layout.kind === 'listed') {
			const slots = this.layout.slots.map((slot, index) =>
				resolveWorkspaceFolder(slot, projectDir, `slots[${String(index)}]`)
			);
			const seen = new Set<string>();
			for (const slot of slots) {
				const key = process.platform === 'win32' ? slot.toLowerCase() : slot;
				if (seen.has(key)) {
					throw new Error(
						`Invalid options for workspace provider "pool": the folder "${slot}" is listed twice in "slots".`
					);
				}
				seen.add(key);
			}
			return slots;
		}
		const { dir, prefix, count } = this.layout;
		const resolvedDir = resolveWorkspaceFolder(dir, projectDir, 'dir');
		const wanted = Array.from({ length: count }, (_, index) =>
			path.join(resolvedDir, `${prefix}${String(index + 1)}`)
		);
		const missing = wanted.filter(slot => !isDirectory(slot));
		if (missing.length > 0) {
			throw new Error(
				`The pool folder(s) ${missing.map(slot => `"${slot}"`).join(', ')} do not exist. The pool provider never creates a slot: ` +
					`create each one first, for example: git clone <repository url> "${path.join(resolvedDir, `${prefix}1`)}" (repeat for 2..${String(count)}), ` +
					'or lower "count" to the folders you have.'
			);
		}
		// Present: still refused when one is a link or otherwise unusable, naming the option.
		return wanted.map(slot => resolveWorkspaceFolder(slot, resolvedDir, 'dir'));
	}
}

function isDirectory(folder: string): boolean {
	try {
		return statSync(folder).isDirectory();
	} catch {
		return false;
	}
}
