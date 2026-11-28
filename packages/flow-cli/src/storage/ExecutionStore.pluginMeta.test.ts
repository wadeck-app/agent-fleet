import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ExecutionStore } from './ExecutionStore';

describe('ExecutionStore pluginMetaDir', () => {
	let tmpDir: string;
	let store: ExecutionStore;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-store-meta-'));
		store = new ExecutionStore(tmpDir);
	});
	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('persists pluginMetaDir when given and omits the key otherwise', () => {
		const withMeta = store.create({
			executionId: 'aaaaaaaa',
			flowFile: 'f.yml',
			flowId: 'f',
			stepIds: ['s'],
			pluginMetaDir: '/x/ws.meta',
		});
		const without = store.create({ executionId: 'bbbbbbbb', flowFile: 'f.yml', flowId: 'f', stepIds: ['s'] });

		expect(store.read('aaaaaaaa').pluginMetaDir).toBe('/x/ws.meta');
		expect(withMeta.pluginMetaDir).toBe('/x/ws.meta');
		expect('pluginMetaDir' in without).toBe(false);
		expect('pluginMetaDir' in store.read('bbbbbbbb')).toBe(false);
	});

	it('reads and updates an old-format record without the field', () => {
		fs.writeFileSync(
			path.join(tmpDir, 'cccccccc.json'),
			JSON.stringify({
				executionId: 'cccccccc',
				flowFile: 'f.yml',
				flowId: 'f',
				status: 'running',
				currentSteps: [],
				startedAt: new Date().toISOString(),
				completedAt: null,
				steps: { s: { status: 'pending' } },
			})
		);

		expect(store.read('cccccccc').pluginMetaDir).toBeUndefined();
		store.markStepRunning('cccccccc', 's');
		expect(store.read('cccccccc').steps['s']?.status).toBe('running');
	});

	it('persists workspaceDir when given, keeps it through later updates, and omits the key otherwise (older records)', () => {
		store.create({
			executionId: 'eeeeeeee',
			flowFile: 'f.yml',
			flowId: 'f',
			stepIds: ['s'],
			workspaceDir: '/x/ws',
		});
		store.create({ executionId: 'ffffffff', flowFile: 'f.yml', flowId: 'f', stepIds: ['s'] });

		store.markStepRunning('eeeeeeee', 's');
		store.update('eeeeeeee', { lastError: 'x' });
		store.markExecutionFailed('eeeeeeee');

		expect(store.read('eeeeeeee').workspaceDir).toBe('/x/ws');
		expect('workspaceDir' in store.read('ffffffff')).toBe(false);
	});

	it('keeps pluginMetaDir through later updates of the record', () => {
		store.create({
			executionId: 'dddddddd',
			flowFile: 'f.yml',
			flowId: 'f',
			stepIds: ['s'],
			pluginMetaDir: '/x/ws.meta',
		});

		store.markStepRunning('dddddddd', 's');

		expect(store.read('dddddddd').pluginMetaDir).toBe('/x/ws.meta');
	});
});
