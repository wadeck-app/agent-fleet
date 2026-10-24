import { FlowCoreError } from '../errors.js';

export type FlowVersionErrorKind =
	| 'version-invalid'
	| 'version-conflict'
	| 'version-not-found'
	| 'version-ambiguous'
	| 'version-with-file'
	| 'flow-not-found'
	| 'registry-unreadable'
	| 'registry-unsupported'
	| 'snapshot-corrupt';

/** A flow version could not be chosen or accepted; the message says what to change. */
export class FlowVersionError extends FlowCoreError {
	constructor(
		message: string,
		override readonly kind: FlowVersionErrorKind
	) {
		super(message, kind);
	}
}
