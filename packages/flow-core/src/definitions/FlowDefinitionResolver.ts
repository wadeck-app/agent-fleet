import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';

import { definitionSnapshotRefOf } from '../config/FlowConfigLayout.js';
import { errorMessage } from '../errors.js';
import type { VersionChoice } from '../execution/ExecutionState.js';
import { hashDefinition, shortHashOf } from './DefinitionHash.js';
import { type DefinitionSnapshotStore, type KnownVersion } from './DefinitionSnapshotStore.js';
import { UNVERSIONED, missingVersionWarning, readFlowVersion } from './FlowVersion.js';
import { FlowVersionError } from './FlowVersionError.js';
import { readRegisteredFlow } from './RegisteredFlowReader.js';
import { compareSemanticVersions, highestSemanticVersion, isSemanticVersion } from './SemanticVersion.js';

export interface ResolvedDefinition {
	flow: FlowDefinition;
	flowId: string;
	version: string;
	/** Full hash of the definition (see hashDefinition). */
	hash: string;
	/** Reference of the stored snapshot, relative to the definitions directory. */
	definitionSnapshot: string;
	choice: VersionChoice;
	/** Advice for the person who started the run (missing version, lowered version...). */
	warnings: string[];
	/** Writes the snapshot (idempotent). Call once the definition is accepted: nothing is stored before, so a refused definition does not freeze its version. */
	commit: () => void;
}

export interface FileRequest {
	flowId: string;
	/** The parsed file. */
	flow: FlowDefinition;
	/** The file's exact text, kept as the snapshot. */
	text: string;
	/** Names the file in messages. */
	label: string;
}

export interface RegisteredRequest {
	flowId: string;
	/** `.flow/flows.yml`; may not exist when only snapshots are left. */
	registryFile: string;
	/** Undefined = latest. */
	requestedVersion: string | undefined;
}

/** The snapshot of the same explicit version whose content differs from `hash`, if any (0.0.0 never conflicts). */
export function findVersionConflict(
	known: readonly KnownVersion[],
	version: string,
	hash: string
): KnownVersion | undefined {
	if (version === UNVERSIONED) {
		return undefined;
	}
	return known.find(entry => entry.version === version && entry.hash !== shortHashOf(hash));
}

export function versionConflictMessage(version: string, existing: KnownVersion, label: string): string {
	return (
		`${label} has the same version ${version} but different content than the snapshot ${existing.hash} ` +
		`(first seen ${existing.firstSeen}): bump the version in ${label}. Versions are immutable once a flow ran.`
	);
}

function listVersions(known: readonly KnownVersion[]): string {
	return known.length === 0 ? '(none)' : known.map(entry => `${entry.version} (${entry.hash})`).join(', ');
}

/**
 * Decides which definition an execution runs and keeps an immutable snapshot of it. All version rules live here:
 * a file runs as is; a registered id runs the highest semver among its registry entry and its snapshots
 * (or the one pinned); the same explicit version never holds two different contents.
 */
export class FlowDefinitionResolver {
	constructor(private readonly store: DefinitionSnapshotStore) {}

	forFile(request: FileRequest): ResolvedDefinition {
		return this.adopt(request, 'file');
	}

	forRegistered(request: RegisteredRequest): ResolvedDefinition {
		const { flowId, registryFile, requestedVersion } = request;
		if (requestedVersion !== undefined && !isSemanticVersion(requestedVersion)) {
			throw new FlowVersionError(
				`'${requestedVersion}' is not a valid semantic version. Use flow run ${flowId}@MAJOR.MINOR.PATCH (for example ${flowId}@1.2.0); ` +
					'see the known versions with: flow versions ' +
					flowId,
				'version-invalid'
			);
		}
		const registered = readRegisteredFlow(registryFile, flowId);
		const known = this.store.list(flowId);
		const entryLabel = `the registry entry '${flowId}' in ${registryFile}`;
		const entryVersion = registered ? readFlowVersion(registered.definition, entryLabel).version : undefined;
		const versions = [...known.map(entry => entry.version), ...(entryVersion === undefined ? [] : [entryVersion])];
		if (versions.length === 0) {
			throw new FlowVersionError(
				`Flow '${flowId}' is not an existing file, has no entry in the registry ${registryFile} and was never run, so no version of it is known. ` +
					'Check the id, or run it once from its file: flow run <path>.',
				'flow-not-found'
			);
		}
		const target = requestedVersion ?? highestSemanticVersion(versions)!;
		if (!versions.includes(target)) {
			throw new FlowVersionError(
				`There is no version ${target} of flow '${flowId}'. Known versions: ${listVersions(known)}` +
					(entryVersion !== undefined && !known.some(entry => entry.version === entryVersion)
						? `, ${entryVersion} (registry, not run yet)`
						: '') +
					'. List them with: flow versions ' +
					flowId,
				'version-not-found'
			);
		}
		const choice: VersionChoice = requestedVersion === undefined ? 'latest' : 'pinned';
		if (registered && entryVersion === target) {
			return this.adopt(
				{ flowId, flow: registered.definition, text: registered.text, label: `${entryLabel}` },
				choice
			);
		}
		const resolved = this.fromSnapshot(flowId, known, target, choice);
		if (
			entryVersion !== undefined &&
			requestedVersion === undefined &&
			compareSemanticVersions(entryVersion, target) < 0
		) {
			resolved.warnings.push(
				`${entryLabel} is version ${entryVersion}, lower than the known version ${target}: running ${target}. ` +
					`Set the entry's version above ${target} to run your edit.`
			);
		}
		return resolved;
	}

	private adopt(request: FileRequest, choice: VersionChoice): ResolvedDefinition {
		const { flowId, flow, text, label } = request;
		const declared = readFlowVersion(flow, label);
		const hash = hashDefinition(flow);
		const conflict = findVersionConflict(this.store.list(flowId), declared.version, hash);
		if (conflict) {
			throw new FlowVersionError(versionConflictMessage(declared.version, conflict, label), 'version-conflict');
		}
		return {
			flow,
			flowId,
			version: declared.version,
			hash,
			definitionSnapshot: definitionSnapshotRefOf(flowId, declared.version, hash),
			choice,
			warnings: declared.implicit ? [missingVersionWarning(flowId)] : [],
			commit: () => {
				this.store.save({ flowId, version: declared.version, hash, text });
			},
		};
	}

	private fromSnapshot(
		flowId: string,
		known: readonly KnownVersion[],
		version: string,
		choice: VersionChoice
	): ResolvedDefinition {
		const matching = known.filter(entry => entry.version === version);
		if (matching.length > 1) {
			throw new FlowVersionError(
				`Version ${version} of flow '${flowId}' matches ${matching.length} different contents (${matching.map(entry => entry.hash).join(', ')}): ` +
					"it was run without a version field. In the flow file, add a version (version: '1.0.0') so runs can be told apart.",
				'version-ambiguous'
			);
		}
		const snapshot = matching[0]!;
		const text = this.store.read(snapshot.ref);
		let flow: FlowDefinition;
		try {
			flow = yaml.load(text, { schema: yaml.JSON_SCHEMA }) as FlowDefinition;
		} catch (err) {
			throw new FlowVersionError(
				`The definition snapshot ${snapshot.ref} is not valid YAML (${errorMessage(err)}). Restore it or run the flow again from its file.`,
				'snapshot-corrupt'
			);
		}
		const hash = hashDefinition(flow);
		if (shortHashOf(hash) !== snapshot.hash) {
			throw new FlowVersionError(
				`The definition snapshot ${snapshot.ref} no longer matches its hash (found ${shortHashOf(hash)}): it was modified after it was written. ` +
					'Delete it and run the flow again from its file, or restore the original.',
				'snapshot-corrupt'
			);
		}
		return {
			flow,
			flowId,
			version,
			hash,
			definitionSnapshot: snapshot.ref,
			choice,
			warnings: [],
			commit: () => undefined,
		};
	}
}
