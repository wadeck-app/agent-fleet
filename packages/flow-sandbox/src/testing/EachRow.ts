/**
 * Runs every row of a table inside ONE test. Same rows and same checks as `it.each`, but one entry in the report: used where the
 * rows are small variations of one protected behaviour (a validator refusing each bad value). A failing row says which one it was.
 * Rows follow `it.each`: an array row is spread into the check's arguments, anything else is passed as it is.
 */
// Same overloads as vitest's it.each, so the callbacks keep their parameter types.
export function eachRow<T extends unknown[] | [unknown]>(
	rows: readonly T[],
	check: (...args: T) => unknown
): Promise<void>;
export function eachRow<T extends readonly unknown[]>(
	rows: readonly T[],
	check: (...args: T) => unknown
): Promise<void>;
export function eachRow<T>(rows: readonly T[], check: (row: T) => unknown): Promise<void>;
export async function eachRow(rows: readonly unknown[], check: (...args: never[]) => unknown): Promise<void> {
	for (const row of rows) {
		try {
			await (Array.isArray(row) ? check(...(row as never[])) : check(row as never));
		} catch (error) {
			const name = rowName(row);
			if (error instanceof Error) {
				error.message = `[row ${name}] ${error.message}`;
				throw error;
			}
			throw new Error(`[row ${name}] ${String(error)}`);
		}
	}
}

function rowName(row: unknown): string {
	if (Array.isArray(row)) return JSON.stringify(row[0] ?? row).slice(0, 80);
	if (typeof row === 'object' && row !== null) {
		const named = row as Record<string, unknown>;
		const label = named['label'] ?? named['name'] ?? named['type'] ?? named['mode'] ?? named['event'];
		return JSON.stringify(label ?? row).slice(0, 80);
	}
	return JSON.stringify(row);
}
