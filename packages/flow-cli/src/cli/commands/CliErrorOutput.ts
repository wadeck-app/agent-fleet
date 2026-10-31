/** The one shape of an error line printed by a CLI command: `Error: <message>` (the message may span several lines). */
export function formatCliError(message: string): string {
	return `Error: ${message}`;
}
