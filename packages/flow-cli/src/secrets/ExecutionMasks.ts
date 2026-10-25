import { MASKING_FAILED, mapStringLeaves } from './SecretMasker';
import type { SecretMasker } from './SecretMasker';

/** Called when a masker throws; receives the execution id and the error, never the text. */
export type MaskingFailureReporter = (executionId: string, error: unknown) => void;

function reportToStderr(executionId: string, error: unknown): void {
	process.stderr.write(
		`[secrets] masking failed for execution ${executionId}; the text was replaced by ${MASKING_FAILED}: ${String(error)}\n`
	);
}

/**
 * The masker of every execution that has declared secrets, shared by every place that writes
 * or forwards execution data (log writer, execution store, worker message ingress).
 *
 * An execution with no registered masker has no secret to hide: its text is returned as is.
 * A masker that fails never lets raw text through: the text becomes {@link MASKING_FAILED}
 * and the failure is reported (without the text).
 *
 * Entries live as long as the daemon: a late message from a worker must still be masked, and
 * the values are already held in memory by the execution itself.
 */
export class ExecutionMasks {
	private readonly maskers = new Map<string, SecretMasker>();

	constructor(private readonly reportFailure: MaskingFailureReporter = reportToStderr) {}

	/** Registers, or replaces (resume re-resolves the secrets), the masker of an execution. */
	register(executionId: string, masker: SecretMasker): void {
		this.maskers.set(executionId, masker);
	}

	mask(executionId: string, text: string): string {
		const masker = this.maskers.get(executionId);
		if (masker === undefined) {
			return text;
		}
		try {
			return masker.mask(text);
		} catch (error) {
			this.reportFailure(executionId, error);
			return MASKING_FAILED;
		}
	}

	/**
	 * Masks text that belongs to no execution (a worker's stderr) with every registered masker,
	 * so a secret of any execution is hidden. A failing masker turns the whole text into the placeholder.
	 */
	maskAll(text: string): string {
		let masked = text;
		for (const [executionId, masker] of this.maskers) {
			try {
				masked = masker.mask(masked);
			} catch (error) {
				this.reportFailure(executionId, error);
				return MASKING_FAILED;
			}
		}
		return masked;
	}

	/** Masks every string of a JSON-like value; a leaf that fails becomes the placeholder. */
	maskDeep<T>(executionId: string, value: T): T {
		if (!this.maskers.has(executionId)) {
			return value;
		}
		return mapStringLeaves(value, text => this.mask(executionId, text));
	}
}
