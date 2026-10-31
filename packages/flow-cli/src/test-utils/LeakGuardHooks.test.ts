import { describe, expect, it, vi } from 'vitest';

import { startBundledDaemon } from './BundledDaemonHarness';
import { armLeakGuardBeforeAll } from './LeakGuardHooks';
import { ProcessLeakGuard, processLeakGuard } from './ProcessLeakGuard';
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

describe('startBundledDaemon without a prior arm', () => {
	it('fails loudly with the fix to apply instead of arming the guard inside the test', async () => {
		const isArmed = vi.spyOn(processLeakGuard, 'isArmed').mockReturnValue(false);
		const arm = vi.spyOn(processLeakGuard, 'arm');
		try {
			await expect(startBundledDaemon()).rejects.toThrow(/armLeakGuardBeforeAll\(\)/);
			expect(arm).not.toHaveBeenCalled();
		} finally {
			isArmed.mockRestore();
			arm.mockRestore();
		}
	});
});

describe('ProcessLeakGuard.watch without a prior arm', () => {
	it('fails loudly with the fix to apply instead of listing processes inside the test', () => {
		const guard = new ProcessLeakGuard({ lister: () => [] });
		expect(() => guard.watch('flow-test-install-abc')).toThrow(/armLeakGuardBeforeAll\(\)/);
		expect(guard.isArmed()).toBe(false);
	});
});
