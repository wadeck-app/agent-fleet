import { describe, expect, it } from 'vitest';

import { CleanupStack } from './CleanupStack';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

describe('CleanupStack', () => {
	it('runs every step once, last registered first, keeps going after a failing step and logs it', async () => {
		const log = new RecordingSandboxLog();
		const stack = new CleanupStack(log);
		const ran: string[] = [];
		stack.add('remove the secrets directory', () => {
			ran.push('secrets');
		});
		stack.add('stop the endpoint', () => {
			ran.push('endpoint');
			throw new Error('port busy');
		});
		stack.add('shut the wrapper down', () => {
			ran.push('wrapper');
			return Promise.resolve();
		});

		const failures = await stack.runAll();
		const second = await stack.runAll();

		expect(ran).toEqual(['wrapper', 'endpoint', 'secrets']);
		expect(failures).toBe(1);
		expect(second).toBe(0);
		expect(log.text()).toContain('Cleanup step "stop the endpoint" failed: port busy');
	});
});
