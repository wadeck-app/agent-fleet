import type { ExecutionState } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ExecutionRecordRemover } from './ExecutionRecordRemover';
import { PluginMetaCleaner } from './PluginMetaCleaner';
import { PLUGIN_META_MARKER_FILE } from './PluginMetaOwnership';

function state(id: string, status: string, extra: object = {}): ExecutionState {
	return {
		executionId: id,
		flowId: 'f',
		status,
		startedAt: '2026-01-01T00:00:00Z',
		steps: {},
		...extra,
	} as unknown as ExecutionState;
}

const finished = (record: ExecutionState): boolean => record.status === 'completed' || record.status === 'failed';

describe('ExecutionRecordRemover', () => {
	let dir: string;
	const file = (name: string): string => path.join(dir, name);
	const write = (record: ExecutionState): void =>
		fs.writeFileSync(file(`${record.executionId}.json`), JSON.stringify(record));

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-remover-'));
	});
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('deletes the record and its restart snapshot, nothing else', () => {
		write(state('aaaaaaa1', 'failed'));
		write(state('aaaaaaa2', 'failed'));
		fs.writeFileSync(file('aaaaaaa1.paused-snapshot'), '{}');
		fs.writeFileSync(file('aaaaaaa2.paused-snapshot'), '{}');
		const result = new ExecutionRecordRemover(dir, finished).remove(['aaaaaaa1'], []);
		expect(result.removed).toEqual([{ executionId: 'aaaaaaa1' }]);
		expect(result.snapshotsRemoved).toBe(1);
		expect(fs.readdirSync(dir).sort()).toEqual(['aaaaaaa2.json', 'aaaaaaa2.paused-snapshot']);
	});

	it('keeps a record that is no longer finished when it is read again', () => {
		write(state('aaaaaaa1', 'running'));
		const result = new ExecutionRecordRemover(dir, finished).remove(['aaaaaaa1'], []);
		expect(result.removed).toEqual([]);
		expect(result.notRemoved[0]!.reason).toContain('status changed to running');
		expect(fs.existsSync(file('aaaaaaa1.json'))).toBe(true);
	});

	it('says so when the record is paused again, gone, unreadable, misnamed or has an invalid id', () => {
		write(state('aaaaaaa1', 'running', { paused: { since: 'x' } }));
		fs.writeFileSync(file('aaaaaaa3.json'), '{not json');
		write({ ...state('aaaaaaa4', 'failed'), executionId: 'zzzzzzz9' });
		fs.renameSync(file('zzzzzzz9.json'), file('aaaaaaa4.json'));
		const result = new ExecutionRecordRemover(dir, finished).remove(
			['aaaaaaa1', 'aaaaaaa2', 'aaaaaaa3', 'aaaaaaa4', '../x'],
			[]
		);
		const reasons = Object.fromEntries(result.notRemoved.map(n => [n.executionId, n.reason]));
		expect(reasons['aaaaaaa1']).toContain('(paused)');
		expect(reasons['aaaaaaa2']).toBe('the record is already gone');
		expect(reasons['aaaaaaa3']).toContain('cannot be read again');
		expect(reasons['aaaaaaa4']).toContain('holds execution "zzzzzzz9"');
		expect(reasons['../x']).toContain('not a valid execution id');
		expect(fs.existsSync(file('aaaaaaa4.json'))).toBe(true);
	});

	it('reports a record it cannot unlink', () => {
		write(state('aaaaaaa1', 'failed'));
		// Simulates the file being replaced between the check and the unlink: a directory cannot be unlinked as a file.
		const result = new ExecutionRecordRemover(dir, record => {
			fs.rmSync(file('aaaaaaa1.json'));
			fs.mkdirSync(file('aaaaaaa1.json'));
			return finished(record);
		}).remove(['aaaaaaa1'], []);
		expect(result.removed).toEqual([]);
		expect(result.notRemoved[0]!.reason).toContain('could not be deleted');
	});

	it('removes the plugin .meta named by a deleted record, but not one a stored record still uses', () => {
		const mine = path.join(dir, 'meta', 'aaaaaaa1.meta');
		const shared = path.join(dir, 'meta', 'shared.meta');
		for (const [meta, owner] of [
			[mine, 'aaaaaaa1'],
			[shared, 'aaaaaaa2'],
		] as const) {
			fs.mkdirSync(meta, { recursive: true });
			fs.writeFileSync(path.join(meta, PLUGIN_META_MARKER_FILE), owner);
		}
		write(state('aaaaaaa1', 'failed', { pluginMetaDir: mine }));
		write(state('aaaaaaa2', 'failed', { pluginMetaDir: shared }));
		const stored = state('aaaaaaa9', 'completed', { pluginMetaDir: shared });
		const cleaner = new PluginMetaCleaner(() => {});
		const result = new ExecutionRecordRemover(dir, finished, cleaner).remove(['aaaaaaa1', 'aaaaaaa2'], [stored]);
		expect(result.removed).toHaveLength(2);
		expect(result.pluginMetaRemoved).toBe(1);
		expect(fs.existsSync(mine)).toBe(false);
		expect(fs.existsSync(shared)).toBe(true);
	});

	it('warns on stderr when a leftover snapshot cannot be deleted', () => {
		write(state('aaaaaaa1', 'failed'));
		// A directory named like the snapshot cannot be unlinked as a file.
		fs.mkdirSync(file('aaaaaaa1.paused-snapshot'));
		const written: string[] = [];
		const original = process.stderr.write.bind(process.stderr);
		process.stderr.write = ((chunk: string) => {
			written.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;
		try {
			const result = new ExecutionRecordRemover(dir, finished).remove(['aaaaaaa1'], []);
			expect(result.removed).toHaveLength(1);
			expect(result.snapshotsRemoved).toBe(0);
		} finally {
			process.stderr.write = original;
		}
		expect(written.join('')).toContain('Delete it by hand');
	});
});
