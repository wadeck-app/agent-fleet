/**
 * Format uptime in milliseconds to human-readable string
 *
 * @param milliseconds - Uptime in milliseconds
 * @returns Formatted string like "1h 30m", "45m", "2h 5m", or "0m"
 *
 * @example
 * formatUptime(5400000) // "1h 30m"
 * formatUptime(2700000) // "45m"
 * formatUptime(0)       // "0m"
 */
export function formatUptime(milliseconds: number): string {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}
