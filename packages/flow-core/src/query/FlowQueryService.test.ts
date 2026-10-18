import type { PluginManifest } from 'extension-points';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowCoreError } from '../errors.js';
import type { ExecutionRecord } from '../execution/ExecutionRecord.js';
import { ExecutionLookupError } from '../show/ExecutionDetail.js';
import { makeExec } from '../testing/makeExec.js';
import { WORKER_SOURCE_REGISTRY_FILE } from '../worker/WorkerSources.js';
import { FlowQueryService } from './FlowQueryService.js';

// vi.hoisted: the mock factory below runs before module-level consts exist.
const kit = vi.hoisted(() => {
	class DaemonNotRunningError extends Error {}
	return { DaemonNotRunningError, send: vi.fn(), readPortFile: vi.fn() };
});

vi.mock('@wadeck-app/singleton-daemon-kit', () => ({
	DaemonNotRunningError: kit.DaemonNotRunningError,
	createDaemonClient: () => ({ send: kit.send }),
	readPortFile: kit.readPortFile,
}));

describe('FlowQueryService', () => {
	let root: string;
	let service: FlowQueryService;

	const writeExec = (id: string, overrides: Partial<ExecutionRecord>) => {
		fs.writeFileSync(
			path.join(root, 'executions', `${id}.json`),
			JSON.stringify(makeExec({ executionId: id, ...overrides }))
		);
	};

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-core-service-'));
		fs.mkdirSync(path.join(root, 'executions'));
		fs.mkdirSync(path.join(root, 'logs'));
		service = FlowQueryService.forConfigDir(root);
		kit.send.mockReset();
		kit.readPortFile.mockReset();
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	describe('construction', () => {
		it('derives the three directories from one config dir', () => {
			const derived = FlowQueryService.forConfigDir('/cfg');
			expect(derived.directories).toEqual({
				executionsDir: path.join('/cfg', 'executions'),
				configDir: '/cfg',
				daemonDir: '/cfg',
			});
		});

		it('fails fast naming the missing directory', () => {
			expect(() => new FlowQueryService({ executionsDir: '', configDir: '/c', daemonDir: '/d' })).toThrow(
				/executionsDir/
			);
			expect(() => new FlowQueryService({ executionsDir: '/e', configDir: ' ', daemonDir: '/d' })).toThrow(
				/configDir/
			);
			expect(() => new FlowQueryService({ executionsDir: '/e', configDir: '/c', daemonDir: '' })).toThrow(
				FlowCoreError
			);
		});
	});

	describe('listExecutions / getExecution', () => {
		beforeEach(() => {
			writeExec('aaa11111', { flowId: 'f1', status: 'completed', startedAt: '2026-08-16T12:00:00.000Z' });
			writeExec('bbb22222', { flowId: 'f2', status: 'failed', startedAt: '2026-08-16T13:00:00.000Z' });
		});

		it('lists newest first, with filters and the pre-pagination total', () => {
			expect(service.listExecutions({}).items.map(e => e.executionId)).toEqual(['bbb22222', 'aaa11111']);
			const failed = service.listExecutions({ status: 'failed' });
			expect(failed.items.map(e => e.executionId)).toEqual(['bbb22222']);
			expect(service.listExecutions({ limit: 1 })).toMatchObject({ total: 2 });
		});

		it('renders the history table or the detail view from the same filter', () => {
			expect(service.renderHistory({})).toContain('bbb22222');
			expect(service.renderHistory({ id: 'aaa' })).toContain('Execution: aaa11111');
		});

		it('resolves an execution by prefix with its file path', () => {
			const resolved = service.getExecution('bbb');
			expect(resolved.record.executionId).toBe('bbb22222');
			expect(resolved.filePath).toBe(path.join(root, 'executions', 'bbb22222.json'));
		});

		it('throws a typed lookup error for an unknown id', () => {
			expect(() => service.getExecution('zzz')).toThrow(ExecutionLookupError);
		});

		it('renders an execution detail with the given tail', () => {
			expect(service.renderExecution('aaa', { tail: 10, full: false })).toContain('Execution: aaa11111');
		});
	});

	describe('listWorkers', () => {
		it('returns live workers without reading the declared sources', async () => {
			kit.send.mockResolvedValue([
				{
					workerId: 'w1',
					pid: 1,
					state: 'idle',
					labels: [],
					attachedProjects: [],
					hasUserInterface: false,
					ephemeral: true,
				},
			]);
			const result = await service.listWorkers();
			expect(result.workers).toHaveLength(1);
			expect(result.emptyExplanation).toBeUndefined();
			expect(result.declaredSources).toEqual([]);
		});

		it('explains an empty list using the declared sources, without credential hashes', async () => {
			kit.send.mockRejectedValue(new kit.DaemonNotRunningError('Daemon is not running'));
			fs.writeFileSync(
				path.join(root, WORKER_SOURCE_REGISTRY_FILE),
				JSON.stringify({
					sources: [
						{
							sourceId: 'gpu-box',
							provider: 'built-in:command',
							labels: [],
							maxWorkers: 1,
							tokenHash: 'h',
							createdAt: 'x',
						},
					],
				})
			);
			const result = await service.listWorkers();
			expect(result.workers).toEqual([]);
			expect(result.emptyExplanation).toContain('No worker is connected.');
			expect(result.emptyExplanation).toContain('gpu-box');
			expect(result.declaredSources).toEqual([
				{ sourceId: 'gpu-box', provider: 'built-in:command', labels: [], maxWorkers: 1 },
			]);
			expect(JSON.stringify(result)).not.toContain('tokenHash');
		});

		it('reports an unreadable registry as a warning and still explains the empty list', async () => {
			kit.send.mockRejectedValue(new kit.DaemonNotRunningError('Daemon is not running'));
			fs.writeFileSync(path.join(root, WORKER_SOURCE_REGISTRY_FILE), '{ broken');
			const result = await service.listWorkers();
			expect(result.declaredSourcesError).toMatch(/Failed to parse worker source registry/);
			expect(result.emptyExplanation).toContain('No worker source is declared either');
		});

		it('propagates a typed error when the daemon cannot answer', async () => {
			kit.send.mockRejectedValue(new Error('socket hang up'));
			await expect(service.listWorkers()).rejects.toMatchObject({ kind: 'daemon-error' });
		});
	});

	describe('readLogs', () => {
		it('reads the tail of the day log from the config dir', () => {
			fs.writeFileSync(path.join(root, 'logs', '2026-10-18.ndjson'), 'a\nb\n');
			expect(service.readLogs({ date: '2026-10-18', lines: 1 })).toMatchObject({ exists: true, text: 'b\n' });
		});
	});

	describe('plugins', () => {
		const manifests = {
			none: {
				pluginId: 'none',
				manifestVersion: '1',
				implementations: { workspace: { default: { version: 1 } } },
			} as PluginManifest,
		};

		it('lists and describes plugins from the injected manifests', () => {
			const withPlugins = new FlowQueryService({ ...service.directories, pluginManifests: manifests });
			expect(withPlugins.listPlugins()).toEqual([
				{ id: 'none', extensionPoint: 'workspace', typeString: 'plugins.none.default' },
			]);
			expect(withPlugins.describePlugin('none').snippet).toContain('plugins.none.default');
		});

		it('fails loudly when no manifests were provided instead of listing nothing', () => {
			expect(() => service.listPlugins()).toThrow(/pluginManifests/);
			expect(() => service.listPlugins()).toThrow(FlowCoreError);
		});
	});
});
