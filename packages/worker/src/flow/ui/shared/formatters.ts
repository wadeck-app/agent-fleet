// Shared formatting utilities for FlowWorker UI
import type { LogEntry, StepInfo, ViewType } from './types.js';

export function formatDuration(seconds: number): string {
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${minutes}m ${secs}s`;
}

export function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toTimeString().split(' ')[0]; // HH:MM:SS
}

export function formatStepDuration(durationMs?: number): string {
	if (!durationMs) return '-';
	const seconds = durationMs / 1000;
	return seconds.toFixed(1) + 's';
}

export function getStepStatusIcon(status: StepInfo['status']): string {
	switch (status) {
		case 'completed':
			return '✓';
		case 'failed':
			return '✗';
		case 'running':
			return '▶';
		case 'pending':
			return '○';
		case 'skipped':
			return '⊘';
		default:
			return '?';
	}
}

export function getStepStatusEmoji(status: StepInfo['status']): string {
	switch (status) {
		case 'completed':
			return '✓';
		case 'failed':
			return '✗';
		case 'running':
			return '►';
		case 'pending':
			return '○';
		case 'skipped':
			return '⊘';
		default:
			return '?';
	}
}

export function getLogIcon(level: LogEntry['level']): string {
	switch (level) {
		case 'success':
			return '✓';
		case 'error':
			return '✗';
		case 'warning':
			return '⚠';
		case 'info':
			return '→';
		case 'debug':
			return ' ';
		default:
			return '•';
	}
}

// Get professional icon for log entry (used in all views for consistency)
export function getLogEmoji(log: LogEntry): string {
	if (log.level === 'success') return '✓';
	if (log.level === 'error') return '✗';
	if (log.level === 'warning') return '⚠';

	// Special icons for info messages
	if (log.level === 'info') {
		if (log.message.includes('started') && !log.message.includes('Flow started')) return '→';
		if (log.message.includes('Flow started')) return '►';
		if (log.message.includes('Workspace')) return '•';
	}

	return getLogIcon(log.level);
}

// Get color for log level
export function getLogLevelColor(level: LogEntry['level']): 'green' | 'red' | 'yellow' | 'gray' | 'white' {
	switch (level) {
		case 'success':
			return 'green';
		case 'error':
			return 'red';
		case 'warning':
			return 'yellow';
		case 'debug':
			return 'gray';
		default:
			return 'white';
	}
}

export function getLogColor(level: LogEntry['level']): string {
	switch (level) {
		case 'success':
			return '\x1b[32m'; // green
		case 'error':
			return '\x1b[31m'; // red
		case 'warning':
			return '\x1b[33m'; // yellow
		case 'info':
			return '\x1b[36m'; // cyan
		case 'debug':
			return '\x1b[90m'; // gray
		default:
			return '\x1b[0m'; // reset
	}
}

export const COLORS = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
	white: '\x1b[37m',
};

export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return str.substring(0, maxLength - 3) + '...';
}

export function progressBar(current: number, total: number, width: number = 20): string {
	if (total === 0) return '░'.repeat(width);
	const filled = Math.floor((current / total) * width);
	const empty = width - filled;
	return '▓'.repeat(filled) + '░'.repeat(empty);
}

export function formatPercentage(current: number, total: number): string {
	if (total === 0) return '0%';
	return Math.floor((current / total) * 100) + '%';
}

// Get view number for keyboard shortcuts (1-5)
export function getViewNumber(view: ViewType): number {
	switch (view) {
		case 'split':
			return 1;
		case 'compact':
			return 2;
		case 'timeline':
			return 3;
		case 'fullscreen':
			return 4;
		case 'sidepanel':
			return 5;
		default:
			return 0;
	}
}

// Get view name for display
export function getViewName(view: ViewType): string {
	switch (view) {
		case 'split':
			return 'Split View';
		case 'compact':
			return 'Compact Dashboard';
		case 'timeline':
			return 'Timeline View';
		case 'fullscreen':
			return 'Full Screen Logs';
		case 'sidepanel':
			return 'Side Panel';
		default:
			return 'Unknown';
	}
}
