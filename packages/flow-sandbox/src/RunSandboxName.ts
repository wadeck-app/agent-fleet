import { SandboxError } from './SandboxError';

export interface RunSandboxIdentity {
	wrapperId: string;
	executionId: string;
}

/** Owner marker: every sandbox this plugin creates starts with it, nothing else may. */
export const SANDBOX_NAME_PREFIX = 'flow-sbx-';
/** Our own limit (sbx documents none): keeps names readable in `sbx ls` and safe as file and DNS-like labels. */
export const SANDBOX_NAME_MAX_LENGTH = 63;
const WRAPPER_ID = /^[a-z0-9]{1,12}$/;
const EXECUTION_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Format: `flow-sbx-<wrapperId>-<executionId>`, at most 63 characters.
 * - wrapperId: 1 to 12 lowercase letters or digits (no hyphen, so the first hyphen after the prefix splits the two).
 * - executionId: lowercase letters, digits and inner hyphens, starting and ending with a letter or digit.
 * Anything else (uppercase, periods, path separators, spaces, `..`) is refused rather than rewritten: a
 * silently normalised id could make two runs share a sandbox name.
 */
export class RunSandboxName {
	static format(wrapperId: string, executionId: string): string {
		if (!WRAPPER_ID.test(wrapperId)) {
			throw new SandboxError(
				'invalid-argument',
				`Wrapper id ${JSON.stringify(wrapperId)} cannot be part of a sandbox name: use 1 to 12 lowercase letters or digits (no hyphen).`
			);
		}
		if (!EXECUTION_ID.test(executionId)) {
			throw new SandboxError(
				'invalid-argument',
				`Execution id ${JSON.stringify(executionId)} cannot be part of a sandbox name: use lowercase letters, digits and inner hyphens only.`
			);
		}
		const name = `${SANDBOX_NAME_PREFIX}${wrapperId}-${executionId}`;
		if (name.length > SANDBOX_NAME_MAX_LENGTH) {
			throw new SandboxError(
				'invalid-argument',
				`Sandbox name "${name}" is ${name.length} characters, the limit is ${SANDBOX_NAME_MAX_LENGTH}: use a shorter wrapper or execution id.`
			);
		}
		return name;
	}

	static isWrapperId(wrapperId: string): boolean {
		return WRAPPER_ID.test(wrapperId);
	}

	/** The wrapper and execution ids of a name this plugin could have created, or undefined for any other name. */
	static parse(name: string): RunSandboxIdentity | undefined {
		if (name.length > SANDBOX_NAME_MAX_LENGTH || !name.startsWith(SANDBOX_NAME_PREFIX)) return undefined;
		const rest = name.slice(SANDBOX_NAME_PREFIX.length);
		const separator = rest.indexOf('-');
		if (separator < 1) return undefined;
		const wrapperId = rest.slice(0, separator);
		const executionId = rest.slice(separator + 1);
		if (!WRAPPER_ID.test(wrapperId) || !EXECUTION_ID.test(executionId)) return undefined;
		return { wrapperId, executionId };
	}
}
