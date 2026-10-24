import type { ExecutionState } from '../execution/ExecutionState.js';
import { shortHashOf } from './DefinitionHash.js';

type VersionFields = Pick<ExecutionState, 'flowVersion' | 'definitionHash' | 'versionChoice'>;

const CHOICE_TEXT = {
	latest: 'latest at run start',
	pinned: 'pinned by the request',
	file: 'the flow file as it was',
} as const;

/** Version cell of a list: the recorded version, or `-` for a record written before versions existed. */
export function versionColumnOf(exec: Pick<ExecutionState, 'flowVersion'>): string {
	return exec.flowVersion ?? '-';
}

/** How the version was chosen and which content ran, without the version itself; for a cell next to it. */
export function versionNoteOf(exec: VersionFields): string {
	if (exec.flowVersion === undefined) {
		return 'run started before flow versions existed';
	}
	if (exec.versionChoice === undefined || exec.definitionHash === undefined) {
		throw new Error(
			`Execution record has flowVersion ${exec.flowVersion} but no versionChoice / definitionHash: the record is incomplete. Inspect or delete it.`
		);
	}
	return `${CHOICE_TEXT[exec.versionChoice]}, definition ${shortHashOf(exec.definitionHash)}`;
}

/** One-line description for detail views: version, how it was chosen, which content ran. */
export function versionDetailLineOf(exec: VersionFields): string {
	const note = versionNoteOf(exec);
	return exec.flowVersion === undefined ? `not recorded (${note})` : `${exec.flowVersion} (${note})`;
}
