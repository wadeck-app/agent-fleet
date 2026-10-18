/**
 * Renders Windows NTSTATUS process exit codes (e.g. 3221225794) as hex + symbolic name.
 *
 * Node reports an NTSTATUS exit code as a positive unsigned 32-bit number, so only
 * [0xC0000000, 0xFFFFFFFF] qualifies: negative values (-1 = timeout marker here) and ordinary
 * codes (1, 2, 127...) are never NTSTATUS.
 */

/** One-line Git Bash command counting the processes that leak when 0xC0000142 occurs. */
export const PROCESS_COUNT_COMMAND =
	'for p in bash conhost node; do echo "$p $(tasklist //FI "IMAGENAME eq $p.exe" //NH | grep -ci "$p.exe")"; done';

const NTSTATUS_MIN = 0xc0000000;
const NTSTATUS_MAX = 0xffffffff;

const STATUS_DLL_INIT_FAILED = 0xc0000142;

const KNOWN_STATUS_NAMES: ReadonlyMap<number, string> = new Map([
	[0xc0000005, 'STATUS_ACCESS_VIOLATION'],
	[0xc0000017, 'STATUS_NO_MEMORY'],
	[0xc0000022, 'STATUS_ACCESS_DENIED'],
	[0xc000013a, 'STATUS_CONTROL_C_EXIT'],
	[0xc0000135, 'STATUS_DLL_NOT_FOUND'],
	[STATUS_DLL_INIT_FAILED, 'STATUS_DLL_INIT_FAILED'],
	[0xc00000fd, 'STATUS_STACK_OVERFLOW'],
	[0xc0000409, 'STATUS_STACK_BUFFER_OVERRUN'],
]);

export class NtStatusDescriber {
	static isNtStatus(exitCode: number): boolean {
		return Number.isInteger(exitCode) && exitCode >= NTSTATUS_MIN && exitCode <= NTSTATUS_MAX;
	}

	/** `0xC0000142 STATUS_DLL_INIT_FAILED`, or `0xC0000999` (hex only) for an unknown status. */
	static format(exitCode: number): string {
		if (!NtStatusDescriber.isNtStatus(exitCode)) {
			throw new Error(`Exit code ${exitCode} is not an NTSTATUS (expected 0xC0000000..0xFFFFFFFF)`);
		}
		const hex = `0x${exitCode.toString(16).toUpperCase().padStart(8, '0')}`;
		const name = KNOWN_STATUS_NAMES.get(exitCode);
		return name ? `${hex} ${name}` : hex;
	}

	/** Actionable hint for statuses with a known operational cause, null otherwise. */
	static hint(exitCode: number): string | null {
		if (exitCode !== STATUS_DLL_INIT_FAILED) return null;
		return (
			'the process failed to initialise (usually the machine is out of console/desktop-heap resources, ' +
			'or the worker lost its console). Check for leaked bash.exe/conhost.exe/node.exe processes ' +
			`(Git Bash: ${PROCESS_COUNT_COMMAND}) and restart the flow workers.`
		);
	}
}
