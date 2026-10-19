import * as crypto from 'node:crypto';

// Single definition of what an execution id is: the daemon generates and validates them (flow-cli), every
// reader (history, show, app-modules) matches them.

export const EXECUTION_ID_LENGTH = 8;

const EXECUTION_ID_RE = new RegExp(`^[a-z0-9]{${EXECUTION_ID_LENGTH}}$`);
const EXECUTION_ID_PREFIX_RE = /^[a-z0-9]+$/;

/** A fresh id: EXECUTION_ID_LENGTH lowercase base-36 characters. */
export function generateExecutionId(): string {
	const hex = crypto.randomUUID().replace(/-/g, '');
	return parseInt(hex.slice(0, 11), 16).toString(36).padStart(EXECUTION_ID_LENGTH, '0').slice(-EXECUTION_ID_LENGTH);
}

/** Whether `value` is a complete id, as the daemon generates it (also what makes it safe as a file name). */
export function isExecutionId(value: string): boolean {
	return EXECUTION_ID_RE.test(value);
}

/** Whether `target` could be an execution id or an id prefix as printed by `flow history`. */
export function looksLikeExecutionId(target: string): boolean {
	return EXECUTION_ID_PREFIX_RE.test(target);
}
