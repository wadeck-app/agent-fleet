import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { type PausedRunSnapshot, PausedRunSnapshotStore } from './PausedRunSnapshotStore';

describe('PausedRunSnapshotStore', () => {
	let dir: string;
	const masks = new ExecutionMasks();

	const snapshot = (note = 'hello'): PausedRunSnapshot => ({
		run: { type: 'run', flowFile: 'a.yml' },
		scheduler: { version: 1, note } as never,
		queued: ['s2'],
		context: { stepOutputs: { s1: { out: note } }, stepMeta: {} },
		stepCount: 2,
		workspace: { path: '/w', id: 'in-place:abcd1234' },
	});

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paused-snapshot-'));
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('round-trips a snapshot, in a file no record listing sees', () => {
		const store = new PausedRunSnapshotStore(dir, masks);

		store.write('abcd1234', snapshot());
		const read = store.read('abcd1234');

		expect(read).toMatchObject({ ok: true, snapshot: snapshot() });
		expect(fs.readdirSync(dir)).toEqual(['abcd1234.paused-snapshot']);
	});

	it('replaces the previous snapshot', () => {
		const store = new PausedRunSnapshotStore(dir, masks);
		store.write('abcd1234', snapshot('first'));
		store.write('abcd1234', snapshot('second'));

		expect(store.read('abcd1234')).toMatchObject({
			ok: true,
			snapshot: { context: { stepOutputs: { s1: { out: 'second' } } } },
		});
	});

	it('refuses an over-size snapshot, says so with both sizes, never cuts, and deletes the older snapshot', () => {
		const store = new PausedRunSnapshotStore(dir, masks, 2_000);
		store.write('abcd1234', snapshot());

		expect(() => store.write('abcd1234', snapshot('x'.repeat(5_000)))).toThrow(
			/MiB, the limit is .* MiB \(step outputs are kept whole, never cut\)/
		);
		expect(store.read('abcd1234')).toMatchObject({ ok: false, missing: true });
	});

	it('masks the declared secrets of the run before writing', () => {
		const secretMasks = new ExecutionMasks();
		secretMasks.register('abcd1234', { mask: (text: string) => text.replaceAll('hunter2', '***') } as never);
		const store = new PausedRunSnapshotStore(dir, secretMasks);

		store.write('abcd1234', snapshot('token hunter2'));

		expect(fs.readFileSync(path.join(dir, 'abcd1234.paused-snapshot'), 'utf8')).not.toContain('hunter2');
	});

	it('reports a missing file as missing, and damaged files with the reason', () => {
		const store = new PausedRunSnapshotStore(dir, masks);
		const file = path.join(dir, 'abcd1234.paused-snapshot');
		const reasonOf = (): string => {
			const read = store.read('abcd1234');
			if (read.ok) {
				throw new Error('expected a refusal');
			}
			return read.reason;
		};

		expect(store.read('abcd1234')).toMatchObject({ ok: false, missing: true });
		fs.writeFileSync(file, 'not json');
		expect(reasonOf()).toContain('not valid JSON');
		fs.writeFileSync(file, JSON.stringify({ version: 2, executionId: 'abcd1234' }));
		expect(reasonOf()).toContain('has version 2');
		fs.writeFileSync(file, JSON.stringify({ version: 1, executionId: 'zzzz9999', payload: {} }));
		expect(reasonOf()).toContain('belongs to execution "zzzz9999"');
		fs.writeFileSync(
			file,
			JSON.stringify({
				version: 1,
				executionId: 'abcd1234',
				payload: { run: {}, scheduler: {}, context: {}, workspace: {}, queued: [], stepCount: 1 },
			})
		);
		expect(reasonOf()).toContain('"workspace" has no path and id');
		fs.writeFileSync(file, 'null');
		expect(reasonOf()).toContain('is not an object');
	});

	it('removes a snapshot, and nothing when there is none', () => {
		const store = new PausedRunSnapshotStore(dir, masks);
		store.write('abcd1234', snapshot());

		store.remove('abcd1234');
		store.remove('abcd1234');

		expect(fs.readdirSync(dir)).toEqual([]);
	});

	it('refuses an id that is not an execution id (no path building from it)', () => {
		expect(() => new PausedRunSnapshotStore(dir, masks).fileOf('../x')).toThrow(/Invalid executionId/);
	});
});
