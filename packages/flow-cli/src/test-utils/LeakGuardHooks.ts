// Test helper: arms the process leak guard in a beforeAll hook instead of inside the first test body.
//
// Why: arming lists every OS process (0.3-1 s idle, 5-25 s on a busy Windows machine). Done lazily by startTestDaemon it was
// charged to the first test's 5 s timeout and made that test flaky under load. A hook has its own, larger timeout.
import { beforeAll } from 'vitest';

import { type ProcessLeakGuard, processLeakGuard } from './ProcessLeakGuard';

/** Covers the documented 25 s worst case of the process listing, with margin. */
export const LEAK_GUARD_ARM_TIMEOUT_MS = 60_000;

/**
 * Registers a beforeAll that arms the guard. Call it at the top level of every test file that uses `startTestDaemon`
 * (which throws when the guard was not armed beforehand). Files that need no daemon do not call it and pay nothing.
 */
export function armLeakGuardBeforeAll(guard: Pick<ProcessLeakGuard, 'arm'> = processLeakGuard): void {
	beforeAll(() => {
		guard.arm();
	}, LEAK_GUARD_ARM_TIMEOUT_MS);
}
