/** Base of every error flow-core throws on purpose; `kind` lets callers branch without parsing messages. */
export class FlowCoreError extends Error {
	constructor(
		message: string,
		readonly kind: string
	) {
		super(message);
		this.name = new.target.name;
	}
}

/** A query option (limit, offset, ...) that cannot be honoured. */
export class InvalidQueryError extends FlowCoreError {
	constructor(message: string) {
		super(message, 'invalid-query');
	}
}

/** Best-effort message of an unknown thrown value. */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
