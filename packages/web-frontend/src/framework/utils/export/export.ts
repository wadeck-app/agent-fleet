/* global Blob */
/**
 * Export utility functions for converting data to various formats
 */

export type ExportFormat = 'json' | 'csv';

/**
 * Convert an array of objects to CSV format
 * @param data - Array of objects to convert
 * @param columns - Optional array of column keys to include (in order)
 * @returns CSV string
 */
export function convertToCSV<T extends Record<string, unknown>>(data: T[], columns?: (keyof T)[]): string {
	if (data.length === 0) {
		return '';
	}

	// Determine columns from first row if not provided
	const keys = columns || (Object.keys(data[0]!) as (keyof T)[]);

	// Create header row
	const header = keys.map(key => escapeCSVValue(String(key))).join(',');

	// Create data rows
	const rows = data.map(row =>
		keys
			.map(key => {
				const value = row[key];
				return escapeCSVValue(formatCSVValue(value));
			})
			.join(',')
	);

	return [header, ...rows].join('\n');
}

/**
 * Escape a value for CSV format
 * Wraps in quotes if it contains comma, newline, or quote
 */
function escapeCSVValue(value: string): string {
	// If value contains comma, newline, or quote, wrap in quotes and escape internal quotes
	if (value.includes(',') || value.includes('\n') || value.includes('"')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/**
 * Format a value for CSV output
 */
function formatCSVValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'object') {
		return JSON.stringify(value);
	}
	return String(value);
}

/**
 * Convert data to JSON format
 * @param data - Data to convert
 * @param pretty - Whether to pretty-print the JSON (default: true)
 * @returns JSON string
 */
export function convertToJSON<T>(data: T, pretty: boolean = true): string {
	return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

/**
 * Download a file to the user's computer
 * @param content - File content as string
 * @param filename - Name of the file to download
 * @param mimeType - MIME type of the file
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

/**
 * Export data in the specified format
 * @param data - Data to export
 * @param format - Export format (json or csv)
 * @param filename - Base filename (without extension)
 * @param columns - Optional array of column keys for CSV export
 */
export function exportData<T extends Record<string, unknown>>(
	data: T[],
	format: ExportFormat,
	filename: string,
	columns?: (keyof T)[]
): void {
	let content: string;
	let mimeType: string;
	let fullFilename: string;

	if (format === 'csv') {
		content = convertToCSV(data, columns);
		mimeType = 'text/csv;charset=utf-8;';
		fullFilename = `${filename}.csv`;
	} else {
		content = convertToJSON(data);
		mimeType = 'application/json;charset=utf-8;';
		fullFilename = `${filename}.json`;
	}

	downloadFile(content, fullFilename, mimeType);
}

/**
 * Generate a timestamp-based filename
 * @param prefix - Prefix for the filename
 * @returns Filename with timestamp (e.g., "books_2024-01-15_143022")
 */
export function generateFilename(prefix: string): string {
	const now = new Date();
	const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
	const time = now.toTimeString().split(' ')[0]!.replace(/:/g, ''); // HHMMSS
	return `${prefix}_${date}_${time}`;
}
