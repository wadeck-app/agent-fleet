import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { CleanupStack } from './CleanupStack';
import { CrashGuard } from './CrashGuard';
import { eachRow } from './testing/EachRow';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

async function crash(
	event: 'uncaughtException' | 'unhandledRejection',
	value: unknown,
	options: { cleanupNeverEnds?: boolean } = {}
): Promise<{ ran: string[]; exits: number[]; log: RecordingSandboxLog }> {
	const log = new RecordingSandboxLog();
	const source = new EventEmitter();
	const cleanup = new CleanupStack(log);
	const ran: string[] = [];
	cleanup.add('remove the secrets directory', () => void ran.push('secrets'));
	cleanup.add(
		'shut the wrapper down (stops the sandbox)',
		options.cleanupNeverEnds === true ? () => new Promise<void>(() => undefined) : () => void ran.push('wrapper')
	);
	const exits: number[] = [];
	new CrashGuard({ source, cleanup, log, exit: code => exits.push(code), timeoutMs: 50 }).install();

	source.emit(event, value);
	source.emit(event, value);
	await new Promise(resolve => setTimeout(resolve, 150));
	return { ran, exits, log };
}

describe('CrashGuard (a crash of the wrapper must leave nothing running)', () => {
	it('(each case): logs it, releases everything once, exits non-zero', () =>
		eachRow(
			[
				{ event: 'uncaughtException' as const, value: new Error('callback boom'), text: 'uncaughtException' },
				{ event: 'unhandledRejection' as const, value: 'plain rejection', text: 'unhandledRejection' },
			],
			async ({ event, value, text }) => {
				const { ran, exits, log } = await crash(event, value);

				expect(ran).toEqual(['wrapper', 'secrets']);
				expect(exits).toEqual([1]);
				expect(log.text()).toContain(`fatal ${text}`);
			}
		));

	it('exits anyway, saying so, when the cleanup does not finish', async () => {
		const { ran, exits, log } = await crash('uncaughtException', new Error('x'), { cleanupNeverEnds: true });

		expect(exits).toEqual([1]);
		expect(ran).toEqual([]);
		expect(log.text()).toContain('did not finish within 50 ms');
	});
});
