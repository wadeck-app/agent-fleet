import type { LiveLogEntry } from 'flow-engine/types';

/**
 * How much a worker prints about the step it is running.
 *
 * `summary` shows the step lifecycle; `verbose` adds the raw output the step produced.
 * Both levels exist because the worker already holds both -- exposing only one would be
 * arbitrary rather than economical (D#31).
 */
export type WorkerVerbosity = 'summary' | 'verbose';

/**
 * What a worker prints to its own terminal while running steps.
 *
 * Structured lifecycle by default, raw output behind `verbose` (D#31). The daemon's log
 * files are deliberately not mirrored back here: the worker is where those lines come
 * from, so re-reading them would be a round trip that adds nothing.
 *
 * A worker runs one step at a time, so raw output never interleaves and needs no
 * per-line correlation to stay readable.
 */
export class WorkerDisplay {
	constructor(
		private readonly verbosity: WorkerVerbosity,
		private readonly write: (line: string) => void = line => {
			console.log(line);
		}
	) {}

	stepStarted(stepId: string): void {
		this.write(`[run ] ${stepId}`);
	}

	/**
	 * Prints a line the step produced.
	 *
	 * Warnings and errors are printed at every verbosity: they are not the detail a user
	 * opted out of, and a warning from a step that still succeeded would otherwise be
	 * visible nowhere on this terminal.
	 */
	stepLog(stepId: string, entry: LiveLogEntry): void {
		const important = entry.level === 'warning' || entry.level === 'error';
		if (this.verbosity !== 'verbose' && !important) return;
		const marker = important ? entry.level.slice(0, 4) : 'out ';
		this.write(`[${marker}] ${stepId}: ${entry.message}`);
	}

	stepCompleted(stepId: string, elapsedMs: number): void {
		this.write(`[ok  ] ${stepId} (${formatDuration(elapsedMs)})`);
	}

	stepFailed(stepId: string, error: string): void {
		this.write(`[fail] ${stepId}: ${error}`);
	}
}

/** Renders a duration at a scale a reader can take in at a glance. */
function formatDuration(elapsedMs: number): string {
	if (elapsedMs < 1_000) return `${String(Math.round(elapsedMs))}ms`;
	// One decimal up to ten seconds: rounding 1.5s to "2s" overstates a short step by a
	// third, which matters when the reader is comparing steps.
	if (elapsedMs < 10_000) return `${(elapsedMs / 1_000).toFixed(1)}s`;
	const totalSeconds = Math.round(elapsedMs / 1_000);
	if (totalSeconds < 60) return `${String(totalSeconds)}s`;
	const minutes = Math.floor(totalSeconds / 60);
	return `${String(minutes)}m${String(totalSeconds % 60)}s`;
}
