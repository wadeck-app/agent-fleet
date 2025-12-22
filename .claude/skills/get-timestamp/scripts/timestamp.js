#!/usr/bin/env node

/**
 * Timestamp utility script
 * Outputs current time in yyyy-MM-dd_HH-mm format by default
 * or accepts a custom format string as argument
 *
 * Usage:
 *   node timestamp.js
 *   node timestamp.js "yyyy-MM-dd"
 *   node timestamp.js "HH:mm:ss"
 */

function formatTimestamp(format) {
	const now = new Date();

	const pad = num => String(num).padStart(2, '0');

	const replacements = {
		yyyy: now.getFullYear(),
		yy: String(now.getFullYear()).slice(-2),
		MM: pad(now.getMonth() + 1),
		M: now.getMonth() + 1,
		dd: pad(now.getDate()),
		d: now.getDate(),
		HH: pad(now.getHours()),
		H: now.getHours(),
		hh: pad(now.getHours() % 12 || 12),
		h: now.getHours() % 12 || 12,
		mm: pad(now.getMinutes()),
		m: now.getMinutes(),
		ss: pad(now.getSeconds()),
		s: now.getSeconds(),
		SSS: String(now.getMilliseconds()).padStart(3, '0'),
		A: now.getHours() >= 12 ? 'PM' : 'AM',
		a: now.getHours() >= 12 ? 'pm' : 'am',
	};

	let result = format;

	// Replace in order of longest to shortest to avoid partial replacements
	const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);

	for (const key of sortedKeys) {
		result = result.replace(new RegExp(key, 'g'), replacements[key]);
	}

	return result;
}

// Get format from command line argument or use default
const customFormat = process.argv[2];
const defaultFormat = 'yyyy-MM-dd_HH-mm';
const format = customFormat || defaultFormat;

// Output the formatted timestamp
console.log(formatTimestamp(format));
