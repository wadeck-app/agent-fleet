import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore } from './ExecutionStore';

// ESM namespaces of node builtins cannot be spied on directly, so the two calls under test go through the module mock.
vi.mock('node:fs', async importOriginal => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, writeFileSync: vi.fn(actual.writeFileSync), renameSync: vi.fn(actual.renameSync) };
});

const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
const EXEC_ID = 'abcd1234';

describe('ExecutionStore -- atomic writes', () => {
	let tmpDir: string;
	let store: ExecutionStore;

	beforeEach(() => {
		vi.mocked(fs.writeFileSync).mockImplementation(actualFs.writeFileSync);
		vi.mocked(fs.renameSync).mockImplementation(actualFs.renameSync);
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-store-atomic-'));
		store = new ExecutionStore(tmpDir);
		store.create({ executionId: EXEC_ID, flowFile: 'flow.yaml', flowId: 'my-flow', stepIds: ['s1'] });
		// Only the calls made by the test count
		vi.mocked(fs.renameSync).mockClear();
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('a reader never sees partial JSON while a write is half done', () => {
		let readDuringWrite: ReturnType<ExecutionStore['read']> | undefined;
		vi.mocked(fs.writeFileSync).mockImplementation((target, data, options) => {
			const text = String(data);
			// Land only the first half, then read, exactly what a concurrent `flow show` could do
			actualFs.writeFileSync(target, text.slice(0, Math.floor(text.length / 2)), options as never);
			readDuringWrite = store.read(EXEC_ID);
			actualFs.writeFileSync(target, text, options as never);
		});

		store.update(EXEC_ID, { status: 'running' });

		expect(readDuringWrite?.status).toBe('queued');
		expect(store.read(EXEC_ID).status).toBe('running');
	});

	it('leaves no temporary file behind', () => {
		store.update(EXEC_ID, { status: 'running' });

		expect(fs.readdirSync(tmpDir)).toEqual([`${EXEC_ID}.json`]);
	});

	it('names the temporary file so that a *.json listing never picks it up', () => {
		const written: string[] = [];
		vi.mocked(fs.writeFileSync).mockImplementation((target, data, options) => {
			written.push(String(target));
			actualFs.writeFileSync(target, data, options as never);
		});

		store.update(EXEC_ID, { status: 'running' });

		expect(written).toHaveLength(1);
		expect(written[0]).not.toBe(path.join(tmpDir, `${EXEC_ID}.json`));
		expect(written[0]!.endsWith('.json')).toBe(false);
	});

	it('retries a rename refused with EPERM (Windows, file briefly open elsewhere) and succeeds', () => {
		let refusals = 2;
		vi.mocked(fs.renameSync).mockImplementation((from, to) => {
			if (refusals-- > 0) {
				throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' });
			}
			actualFs.renameSync(from, to);
		});

		store.update(EXEC_ID, { status: 'running' });

		expect(store.read(EXEC_ID).status).toBe('running');
		expect(fs.readdirSync(tmpDir)).toEqual([`${EXEC_ID}.json`]);
	});

	it('fails loudly with an actionable message after the bounded retries, and cleans the temporary file', () => {
		const rename = vi.mocked(fs.renameSync).mockImplementation(() => {
			throw Object.assign(new Error('EBUSY: resource busy or locked, rename'), { code: 'EBUSY' });
		});

		expect(() => store.update(EXEC_ID, { status: 'running' })).toThrow(
			new RegExp(`Cannot save execution ${EXEC_ID}.*${EXEC_ID}\\.json.*EBUSY.*close`, 's')
		);

		expect(rename.mock.calls.length).toBeGreaterThan(1);
		expect(rename.mock.calls.length).toBeLessThanOrEqual(10);
		expect(fs.readdirSync(tmpDir)).toEqual([`${EXEC_ID}.json`]);
		expect(store.read(EXEC_ID).status).toBe('queued');
	});

	it('does not retry an error that is not a transient lock', () => {
		const rename = vi.mocked(fs.renameSync).mockImplementation(() => {
			throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
		});

		expect(() => store.update(EXEC_ID, { status: 'running' })).toThrow(/ENOSPC/);
		expect(rename).toHaveBeenCalledTimes(1);
		expect(fs.readdirSync(tmpDir)).toEqual([`${EXEC_ID}.json`]);
	});

	it('cleans the temporary file when writing it fails', () => {
		vi.mocked(fs.writeFileSync).mockImplementation((target, data) => {
			actualFs.appendFileSync(String(target), String(data).slice(0, 5));
			throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
		});

		expect(() => store.update(EXEC_ID, { status: 'running' })).toThrow(/ENOSPC/);

		expect(fs.readdirSync(tmpDir)).toEqual([`${EXEC_ID}.json`]);
	});

	it('pruning removes orphaned temporary files older than an hour and keeps recent ones', () => {
		const oldTmp = path.join(tmpDir, `${EXEC_ID}.json.tmp-1-1`);
		const recentTmp = path.join(tmpDir, `${EXEC_ID}.json.tmp-2-1`);
		fs.writeFileSync(oldTmp, '{');
		fs.writeFileSync(recentTmp, '{');
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
		fs.utimesSync(oldTmp, twoHoursAgo, twoHoursAgo);

		store.pruneOldExecutions();

		expect(fs.existsSync(oldTmp)).toBe(false);
		expect(fs.existsSync(recentTmp)).toBe(true);
	});

	it('markStepSkipped() settles a never-run step as completed and keeps the reason', () => {
		store.markStepSkipped(EXEC_ID, 's1', "not run: sub-step 'a' it depends on did not succeed");

		const step = store.read(EXEC_ID).steps['s1']!;
		expect(step.status).toBe('completed');
		expect(step.skippedReason).toBe("not run: sub-step 'a' it depends on did not succeed");
		expect(step.completedAt).toBeDefined();
	});
});
