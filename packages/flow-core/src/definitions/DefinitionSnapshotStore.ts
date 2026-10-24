import * as fs from 'node:fs';
import * as path from 'node:path';

import { definitionFlowDirOf, definitionSnapshotPathOf, definitionSnapshotRefOf } from '../config/FlowConfigLayout.js';
import { FlowCoreError, errorMessage } from '../errors.js';
import { shortHashOf } from './DefinitionHash.js';
import { compareSemanticVersions } from './SemanticVersion.js';

export interface SnapshotWrite {
	flowId: string;
	version: string;
	/** Full hash of the definition (see hashDefinition). */
	hash: string;
	/** Exact text to keep. */
	text: string;
}

export interface SavedSnapshot {
	/** `<flowId>/<version>-<hash12>.yml`, relative to the definitions directory. */
	ref: string;
	/** False when the same version and content was already stored (nothing was written). */
	created: boolean;
}

export interface KnownVersion {
	version: string;
	/** First 12 characters of the definition hash. */
	hash: string;
	ref: string;
	/** ISO time the snapshot was written (the file's modification time: snapshots are never rewritten). */
	firstSeen: string;
}

const FILE_PATTERN = /^(.+)-([0-9a-f]{12})\.yml$/;

/** Immutable, version-addressed copies of the flow definitions that ran. Never rewrites or deletes a snapshot. */
export class DefinitionSnapshotStore {
	constructor(private readonly definitionsDir: string) {}

	save(write: SnapshotWrite): SavedSnapshot {
		const ref = definitionSnapshotRefOf(write.flowId, write.version, write.hash);
		const file = definitionSnapshotPathOf(this.definitionsDir, ref);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		try {
			// 'wx': an existing snapshot is never overwritten, two runs racing to write the same one cannot corrupt it.
			fs.writeFileSync(file, write.text, { encoding: 'utf8', flag: 'wx' });
			return { ref, created: true };
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
				return { ref, created: false };
			}
			throw new FlowCoreError(
				`Cannot write the definition snapshot ${file}: ${errorMessage(err)}. Check that the flow config directory is writable.`,
				'snapshot-unwritable'
			);
		}
	}

	read(ref: string): string {
		const file = definitionSnapshotPathOf(this.definitionsDir, ref);
		try {
			return fs.readFileSync(file, 'utf8');
		} catch (err) {
			throw new FlowCoreError(
				`Cannot read definition snapshot ${file}: ${errorMessage(err)}. ` +
					'It was deleted or is unreadable; run the flow again from its file to recreate the version.',
				'snapshot-unreadable'
			);
		}
	}

	/** Every snapshot of a flow, lowest version first. */
	list(flowId: string): KnownVersion[] {
		const flowDir = definitionFlowDirOf(this.definitionsDir, flowId);
		if (!fs.existsSync(flowDir)) {
			return [];
		}
		const known: KnownVersion[] = [];
		for (const name of fs.readdirSync(flowDir)) {
			const match = FILE_PATTERN.exec(name);
			if (!match) {
				throw new FlowCoreError(
					`${path.join(flowDir, name)} is not a definition snapshot (expected <version>-<hash12>.yml). ` +
						'Remove it or move it out of the definitions directory.',
					'snapshot-foreign-file'
				);
			}
			const firstSeen = fs.statSync(path.join(flowDir, name)).mtime.toISOString();
			known.push({
				version: match[1]!,
				hash: match[2]!,
				ref: `${flowId}/${name}`,
				firstSeen,
			});
		}
		return known.sort(
			(a, b) => compareSemanticVersions(a.version, b.version) || a.firstSeen.localeCompare(b.firstSeen)
		);
	}

	/** Short hash form used when comparing against a full hash. */
	static matches(known: KnownVersion, hash: string): boolean {
		return known.hash === shortHashOf(hash);
	}
}
