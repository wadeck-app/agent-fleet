import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	WORKER_SOURCE_REGISTRY_FILE,
	WorkerSourceRegistryError,
	assertProviderNotRetired,
	parseWorkerSourceFile,
	readDeclaredWorkerSources,
} from './WorkerSources.js';

const entry = (sourceId: string, provider = 'built-in:command') => ({
	sourceId,
	provider,
	labels: ['gpu'],
	maxWorkers: 2,
	tokenHash: 'secret-worker-hash',
	sourceTokenHash: 'secret-source-hash',
	createdAt: '2026-09-13T00:00:00.000Z',
});

describe('worker source registry reading', () => {
	let dir: string;
	let file: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-core-sources-'));
		file = path.join(dir, WORKER_SOURCE_REGISTRY_FILE);
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	describe('parseWorkerSourceFile', () => {
		it('treats a missing file as nothing declared', () => {
			expect(parseWorkerSourceFile(file)).toEqual([]);
		});

		it('returns the declared entries untouched', () => {
			fs.writeFileSync(file, JSON.stringify({ sources: [entry('a')] }));
			expect(parseWorkerSourceFile(file)).toEqual([entry('a')]);
		});

		it('fails on unparseable JSON, names the file and the repair command', () => {
			fs.writeFileSync(file, '{ nope');
			expect(() => parseWorkerSourceFile(file)).toThrow(
				new RegExp(`Failed to parse worker source registry.*flow worker source repair`)
			);
			expect(() => parseWorkerSourceFile(file)).toThrow(WorkerSourceRegistryError);
		});

		it('fails on a file without a sources list instead of reading it as empty', () => {
			fs.writeFileSync(file, JSON.stringify({ other: 1 }));
			expect(() => parseWorkerSourceFile(file)).toThrow(/malformed: expected a "sources" list/);
		});
	});

	describe('assertProviderNotRetired', () => {
		it('accepts current providers', () => {
			expect(() => assertProviderNotRetired('a', 'built-in:relay', file)).not.toThrow();
		});

		it('refuses the pre-rename provider with the re-declare commands', () => {
			expect(() => assertProviderNotRetired('a', 'built-in:host', file)).toThrow(
				/flow worker source remove a.*flow worker source add a --provider built-in:relay/
			);
		});
	});

	describe('readDeclaredWorkerSources', () => {
		it('never exposes token hashes', () => {
			fs.writeFileSync(file, JSON.stringify({ sources: [entry('a')] }));
			const result = readDeclaredWorkerSources(dir);
			expect(result).toEqual([{ sourceId: 'a', provider: 'built-in:command', labels: ['gpu'], maxWorkers: 2 }]);
			expect(JSON.stringify(result)).not.toContain('secret');
		});

		it('fails on a retired provider entry rather than listing it', () => {
			fs.writeFileSync(file, JSON.stringify({ sources: [entry('a', 'built-in:host')] }));
			expect(() => readDeclaredWorkerSources(dir)).toThrow(/no longer exists/);
		});

		it('is empty when no registry exists', () => {
			expect(readDeclaredWorkerSources(dir)).toEqual([]);
		});
	});
});
