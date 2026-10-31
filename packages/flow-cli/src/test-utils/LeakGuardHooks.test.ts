import { describe, expect, it, vi } from 'vitest';

import { armLeakGuardBeforeAll } from './LeakGuardHooks';
import { processLeakGuard } from './ProcessLeakGuard';
import { startTestDaemon } from './TestHelpers';

describe('armLeakGuardBeforeAll', () => {
	let armCalls = 0;
	const guard = {
		arm: () => {
			armCalls += 1;
		},
	};
	armLeakGuardBeforeAll(guard);

	it('arms the guard in the hook, before any test body runs', () => {
		expect(armCalls).toBe(1);
	});
});

describe('startTestDaemon without a prior arm', () => {
	it('fails loudly with the fix to apply instead of listing processes inside the test', async () => {
		const spy = vi.spyOn(processLeakGuard, 'isArmed').mockReturnValue(false);
		try {
			await expect(startTestDaemon()).rejects.toThrow(/armLeakGuardBeforeAll\(\)/);
		} finally {
			spy.mockRestore();
		}
	});
});
