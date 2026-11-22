import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The model codex recorded for a thread, or why it cannot be known. Never a guess. */
export type CodexSessionModel = { model: string } | { unknownReason: string };

/** Above this size the session file is not read (it is not expected to be that large for a model id lookup). */
export const MAX_SESSION_FILE_BYTES = 8 * 1024 * 1024;

/**
 * Reads the model codex actually used from its own session file, for a step that names no `model:` (codex then
 * uses the default of its config.toml, which flow does not read).
 *
 * Measured on codex-cli 0.171.0: a thread is stored in
 * `<CODEX_HOME or ~/.codex>/sessions/YYYY/MM/DD/rollout-<local timestamp>-<thread id>.jsonl`, one JSON object per line
 * `{timestamp, ordinal, type, payload}`. A line of `type: "turn_context"` carries the model of that turn in
 * `payload.model`. A resumed thread appends further turns to the SAME file, so the LAST turn_context wins.
 *
 * Failures (no file, unreadable, too large, no usable turn_context) are returned as `unknownReason`, never thrown.
 * A line that is not valid JSON is skipped: the file is written by another process and may end on a partial line.
 */
export class CodexSessionModelReader {
	private readonly codexHome: string;

	/** @param codexHome overrides the codex home (default: env CODEX_HOME if set, else `~/.codex`). */
	constructor(codexHome?: string) {
		const fromEnvironment = process.env['CODEX_HOME'];
		this.codexHome =
			codexHome ??
			(fromEnvironment !== undefined && fromEnvironment !== '' ? fromEnvironment : path.join(os.homedir(), '.codex'));
	}

	read(threadId: string): CodexSessionModel {
		const sessionsRoot = path.join(this.codexHome, 'sessions');
		// The id becomes part of a file name match: refuse anything that is not a plain id
		if (!/^[0-9A-Za-z-]+$/.test(threadId)) {
			return { unknownReason: `codex thread id '${threadId}' is not a plain id, session file not searched` };
		}
		let filePath: string | undefined;
		try {
			filePath = this.findSessionFile(sessionsRoot, threadId);
		} catch (error) {
			return {
				unknownReason: `cannot search the codex sessions folder '${sessionsRoot}': ${error instanceof Error ? error.message : String(error)}`,
			};
		}
		if (filePath === undefined) {
			return {
				unknownReason: `no codex session file 'rollout-*-${threadId}.jsonl' found under '${sessionsRoot}' (is CODEX_HOME set differently for the codex process?)`,
			};
		}
		let content: string;
		try {
			const size = fs.statSync(filePath).size;
			if (size > MAX_SESSION_FILE_BYTES) {
				return {
					unknownReason: `codex session file '${filePath}' is ${String(size)} bytes, above the ${String(MAX_SESSION_FILE_BYTES)} bytes read limit, not read`,
				};
			}
			content = fs.readFileSync(filePath, 'utf8');
		} catch (error) {
			return {
				unknownReason: `cannot read codex session file '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
			};
		}
		return this.lastModel(filePath, content);
	}

	/** Walks exactly the three date levels, newest day first. */
	private findSessionFile(sessionsRoot: string, threadId: string): string | undefined {
		if (!fs.existsSync(sessionsRoot)) return undefined;
		const suffix = `-${threadId}.jsonl`;
		for (const year of this.sortedDirectories(sessionsRoot)) {
			for (const month of this.sortedDirectories(path.join(sessionsRoot, year))) {
				for (const day of this.sortedDirectories(path.join(sessionsRoot, year, month))) {
					const dayPath = path.join(sessionsRoot, year, month, day);
					const match = fs.readdirSync(dayPath).find(name => name.startsWith('rollout-') && name.endsWith(suffix));
					if (match !== undefined) return path.join(dayPath, match);
				}
			}
		}
		return undefined;
	}

	/** Sub-folders of a folder, newest (largest name) first. */
	private sortedDirectories(folder: string): string[] {
		return fs
			.readdirSync(folder, { withFileTypes: true })
			.filter(entry => entry.isDirectory())
			.map(entry => entry.name)
			.sort()
			.reverse();
	}

	private lastModel(filePath: string, content: string): CodexSessionModel {
		let lastTurnContext: unknown;
		let sawTurnContext = false;
		let skippedLines = 0;
		for (const line of content.split('\n')) {
			if (line.trim() === '') continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				skippedLines++;
				continue;
			}
			if (typeof parsed === 'object' && parsed !== null && (parsed as { type?: unknown }).type === 'turn_context') {
				sawTurnContext = true;
				lastTurnContext = (parsed as { payload?: unknown }).payload;
			}
		}
		const skipped = skippedLines > 0 ? ` (${String(skippedLines)} line(s) that are not JSON were skipped)` : '';
		if (!sawTurnContext) {
			return { unknownReason: `codex session file '${filePath}' has no turn_context line${skipped}` };
		}
		const model =
			typeof lastTurnContext === 'object' && lastTurnContext !== null
				? (lastTurnContext as { model?: unknown }).model
				: undefined;
		if (typeof model !== 'string' || model === '') {
			return {
				unknownReason: `the last turn_context of codex session file '${filePath}' has no non-empty string 'payload.model'${skipped}`,
			};
		}
		return { model };
	}
}
