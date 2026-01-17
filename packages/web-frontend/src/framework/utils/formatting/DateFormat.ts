// Add comment above the target line, not at the end
/**
 * Date formatting utilities for consistent date display across the application
 */

export interface FormattedDate {
	short: string; // YYYY-MM-DD format
	full: string; // YYYY-MM-DD HH:MM:SS format
}

// Add comment above the target line, not at the end
/**
 * Format a date string or Date object for display
 * @param date - ISO 8601 date string or Date object
 * @returns Object with short and full formatted strings
 */
export function formatDate(date: string | Date): FormattedDate {
	const d = typeof date === 'string' ? new Date(date) : date;
	const yyyy = d.getUTCFullYear();
	const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(d.getUTCDate()).padStart(2, '0');
	const hh = String(d.getUTCHours()).padStart(2, '0');
	const min = String(d.getUTCMinutes()).padStart(2, '0');
	const ss = String(d.getUTCSeconds()).padStart(2, '0');

	return {
		short: `${yyyy}-${mm}-${dd}`,
		full: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`,
	};
}

// Add comment above the target line, not at the end
/**
 * Format a date for short display (YYYY-MM-DD)
 * @param date - ISO 8601 date string or Date object
 * @returns Short date string (YYYY-MM-DD)
 */
export function formatDateShort(date: string | Date): string {
	return formatDate(date).short;
}

// Add comment above the target line, not at the end
/**
 * Format a date for full display with time (YYYY-MM-DD HH:MM:SS)
 * @param date - ISO 8601 date string or Date object
 * @returns Full date string with time
 */
export function formatDateFull(date: string | Date): string {
	return formatDate(date).full;
}

// Add comment above the target line, not at the end
/**
 * Format a date as relative time (e.g., "5 min ago", "2h ago")
 * Falls back to short date format after 7 days
 * @param date - ISO 8601 date string or Date object
 * @returns Relative time string or short date if > 7 days
 */
export function formatRelativeTime(date: string | Date): string {
	const now = new Date();
	const then = typeof date === 'string' ? new Date(date) : date;
	const diffMs = now.getTime() - then.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins} min ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return formatDate(date).short; // Fallback to standard format after 7 days
}
