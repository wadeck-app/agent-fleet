// Test helper: fails a test file that makes the real spawner write a launcher script into the developer's REAL temp
// directory (incident 2026-10-31: 20 leftover flow-daemon-run-*.vbs pointing at DaemonBackgroundSpawner.ts, which only a
// vitest process can have written).
//
// Only scripts that point at a TypeScript source as their bundle count: that is never an installed CLI, so a developer
// running `flow run` while the suite runs cannot make the guard flaky.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll } from 'vitest';

import { LAUNCHER_SCRIPT_PREFIX } from '../daemon/StaleLauncherScriptSweeper';

// Captured at import: a test file may later replace os.tmpdir() by a per-test directory, the guard watches the real one.
const REAL_TEMP_DIRECTORY = os.tmpdir();

function sourceLauncherScripts(directory: string): string[] {
	return fs
		.readdirSync(directory)
		.filter(name => name.startsWith(LAUNCHER_SCRIPT_PREFIX) && name.endsWith('.vbs'))
		.filter(name => {
			try {
				return /\.[cm]?tsx?""/.test(fs.readFileSync(path.join(directory, name), 'utf8'));
			} catch {
				// Gone between the listing and the read: a launcher that ran and deleted itself is not a leak.
				return false;
			}
		});
}

/** Names of the launcher scripts written (into `directory`) by a test process since `baseline` was taken. */
export function newSourceLauncherScripts(baseline: ReadonlySet<string>, directory: string = REAL_TEMP_DIRECTORY): string[] {
	return sourceLauncherScripts(directory).filter(name => !baseline.has(name));
}

/** Arms, for the enclosing test file, a baseline in beforeAll and the check in afterAll. */
export function armLauncherScriptLeakGuard(): void {
	let baseline = new Set<string>();
	beforeAll(() => {
		baseline = new Set(sourceLauncherScripts(REAL_TEMP_DIRECTORY));
	});
	afterAll(() => {
		const leaked = newSourceLauncherScripts(baseline);
		if (leaked.length > 0) {
			throw new Error(
				`This test file left ${String(leaked.length)} launcher script(s) in the REAL temp directory ${REAL_TEMP_DIRECTORY}: ${leaked.join(', ')}. ` +
					'Point os.tmpdir() at a per-test directory (see DaemonBackgroundSpawner.test.ts) or inject the spawner.'
			);
		}
	});
}
