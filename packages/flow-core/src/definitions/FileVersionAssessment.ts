import { errorMessage } from '../errors.js';
import { hashDefinition, shortHashOf } from './DefinitionHash.js';
import type { DefinitionSnapshotStore } from './DefinitionSnapshotStore.js';
import { findVersionConflict, versionConflictMessage } from './FlowDefinitionResolver.js';
import { missingVersionWarning, readFlowVersion } from './FlowVersion.js';
import { FlowVersionError } from './FlowVersionError.js';
import { compareSemanticVersions, highestSemanticVersion } from './SemanticVersion.js';

export type FileVersionStatus = 'new' | 'known' | 'conflict' | 'older' | 'invalid';

export interface FileVersionAssessment {
	version: string;
	/** First 12 characters of the definition hash; empty when the version is invalid. */
	hash: string;
	status: FileVersionStatus;
	/** Highest version already snapshotted for this flow id. */
	latestKnown?: string;
	/** Problems that make a run refuse this file. */
	errors: string[];
	/** Advice that does not block a run. */
	warnings: string[];
}

/**
 * What `flow validate` and `flow show <file>` say about the version of a flow file, without running or writing
 * anything: invalid, unversioned, already known, new, or in conflict / below the latest known version.
 */
export function assessFileVersion(
	store: DefinitionSnapshotStore,
	flowId: string,
	flow: unknown,
	label: string
): FileVersionAssessment {
	let declared;
	try {
		declared = readFlowVersion(flow, label);
	} catch (err) {
		if (err instanceof FlowVersionError) {
			return { version: '', hash: '', status: 'invalid', errors: [errorMessage(err)], warnings: [] };
		}
		throw err;
	}
	const hash = hashDefinition(flow);
	const known = store.list(flowId);
	const latestKnown = highestSemanticVersion(known.map(entry => entry.version));
	const base = { version: declared.version, hash: shortHashOf(hash), ...(latestKnown ? { latestKnown } : {}) };
	const warnings = declared.implicit ? [missingVersionWarning(flowId)] : [];
	const conflict = findVersionConflict(known, declared.version, hash);
	if (conflict) {
		return {
			...base,
			status: 'conflict',
			errors: [versionConflictMessage(declared.version, conflict, label)],
			warnings,
		};
	}
	if (known.some(entry => entry.version === declared.version && entry.hash === shortHashOf(hash))) {
		return { ...base, status: 'known', errors: [], warnings };
	}
	if (latestKnown !== undefined && compareSemanticVersions(declared.version, latestKnown) < 0) {
		warnings.push(
			`Version ${declared.version} is lower than the latest known version ${latestKnown} of flow '${flowId}' and its content is new: ` +
				`running the flow by id keeps running ${latestKnown}. Raise the version above ${latestKnown} in ${label}.`
		);
		return { ...base, status: 'older', errors: [], warnings };
	}
	return { ...base, status: 'new', errors: [], warnings };
}

/** The `Version:` lines of `flow show <file>`: the version, what a run would do with it, then each problem. */
export function renderVersionLines(assessment: FileVersionAssessment): string[] {
	const lines = [`Version:   ${versionHeadline(assessment)}`];
	for (const error of assessment.errors) {
		lines.push(`  error: ${error}`);
	}
	for (const warning of assessment.warnings) {
		lines.push(`  warning: ${warning}`);
	}
	return lines;
}

function versionHeadline(assessment: FileVersionAssessment): string {
	switch (assessment.status) {
		case 'invalid':
			return 'invalid';
		case 'known':
			return `${assessment.version} (already run, definition ${assessment.hash})`;
		case 'conflict':
			return `${assessment.version} (conflict)`;
		case 'older':
		case 'new':
			return `${assessment.version} (new content, ${assessment.latestKnown === undefined ? 'never run' : `latest known: ${assessment.latestKnown}`})`;
		default: {
			const unreachable: never = assessment.status;
			throw new Error(`Unhandled version status: ${String(unreachable)}`);
		}
	}
}
