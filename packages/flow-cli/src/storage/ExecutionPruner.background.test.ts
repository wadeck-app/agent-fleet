import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionPruner } from './ExecutionPruner';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('ExecutionPruner.pruneInBackground()', () => {
	let dir: string;

	function writeRecord(id: string, ageMs: number): void {
		const at = new Date(Date.now() - ageMs).toISOString();
		fs.writeFileSync(
			path.join(dir, `${id}.json`),
			JSON.stringify({ executionId: id, status: 'completed', startedAt: at, completedAt: at, steps: {} }),
			'utf8'
		);
	}

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pruner-background-'));
	});

	afterEach(() => removeTempDirectory(dir));

	it('deletes the same records as prune(), yielding the event loop between chunks', async () => {
		for (let i = 0; i < 7; i++) {
			writeRecord(`old0000${String(i)}`, 60 * DAY_MS);
		}
		for (let i = 0; i < 5; i++) {
			writeRecord(`new0000${String(i)}`, DAY_MS);
		}
		let yields = 0;
		const pruner = new ExecutionPruner(dir, 30);

		await pruner.pruneInBackground(5, async () => {
			yields++;
			await Promise.resolve();
		});

		expect(fs.readdirSync(dir).sort()).toEqual([0, 1, 2, 3, 4].map(i => `new0000${String(i)}.json`));
		// 12 records in chunks of 5 -> 3 chunks -> a yield before each chunk after the first
		expect(yields).toBe(2);
	});

	it('lets a pending event-loop task run before the work is finished', async () => {
		for (let i = 0; i < 10; i++) {
			writeRecord(`old0000${String(i)}`, 60 * DAY_MS);
		}
		const order: string[] = [];
		const pruner = new ExecutionPruner(dir, 30);

		const done = pruner.pruneInBackground(2).then(() => order.push('pruned'));
		setImmediate(() => order.push('request'));
		await done;

		expect(order).toEqual(['request', 'pruned']);
	});
});
