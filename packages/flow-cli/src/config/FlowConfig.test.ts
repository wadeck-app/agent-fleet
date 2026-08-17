import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, loadFlowConfig } from './FlowConfig.js';

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-config-test-'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(file: string, content: string): string {
	const p = path.join(tmpDir, file);
	fs.writeFileSync(p, content, 'utf8');
	return p;
}

describe('loadFlowConfig', () => {
	it('returns DEFAULT_CONFIG when file does not exist', () => {
		const config = loadFlowConfig(path.join(tmpDir, 'nonexistent.yaml'));
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it('returns DEFAULT_CONFIG when file is malformed YAML', () => {
		const file = writeConfig('bad.yaml', ':: invalid: yaml: ::');
		const config = loadFlowConfig(file);
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it('overrides queue.concurrency', () => {
		const file = writeConfig('cfg.yaml', 'queue:\n  concurrency: 4\n');
		expect(loadFlowConfig(file).queue.concurrency).toBe(4);
	});

	it('overrides logs.retainDays', () => {
		const file = writeConfig('cfg.yaml', 'logs:\n  retainDays: 7\n');
		expect(loadFlowConfig(file).logs.retainDays).toBe(7);
	});

	it('overrides security.allowAbsolutePaths', () => {
		const file = writeConfig('cfg.yaml', 'security:\n  allowAbsolutePaths: true\n');
		expect(loadFlowConfig(file).security.allowAbsolutePaths).toBe(true);
	});

	describe('limits', () => {
		it('overrides limits.maxInjectedSteps', () => {
			const file = writeConfig('cfg.yaml', 'limits:\n  maxInjectedSteps: 5\n');
			expect(loadFlowConfig(file).limits.maxInjectedSteps).toBe(5);
		});

		it('overrides limits.maxStepsPerExecution', () => {
			const file = writeConfig('cfg.yaml', 'limits:\n  maxStepsPerExecution: 10\n');
			expect(loadFlowConfig(file).limits.maxStepsPerExecution).toBe(10);
		});

		it('overrides both limits independently', () => {
			const file = writeConfig('cfg.yaml', 'limits:\n  maxInjectedSteps: 3\n  maxStepsPerExecution: 15\n');
			const { limits } = loadFlowConfig(file);
			expect(limits.maxInjectedSteps).toBe(3);
			expect(limits.maxStepsPerExecution).toBe(15);
		});

		it('falls back to DEFAULT_CONFIG.limits when limits section absent', () => {
			const file = writeConfig('cfg.yaml', 'queue:\n  concurrency: 2\n');
			expect(loadFlowConfig(file).limits).toEqual(DEFAULT_CONFIG.limits);
		});

		it('default maxInjectedSteps is 20', () => {
			expect(DEFAULT_CONFIG.limits.maxInjectedSteps).toBe(20);
		});

		it('default maxStepsPerExecution is 50', () => {
			expect(DEFAULT_CONFIG.limits.maxStepsPerExecution).toBe(50);
		});
	});

	describe('workspace', () => {
		it('overrides workspace.retainDays', () => {
			const file = writeConfig('cfg.yaml', 'workspace:\n  retainDays: 7\n');
			expect(loadFlowConfig(file).workspace.retainDays).toBe(7);
		});

		it('overrides workspace.maxWorkspaces', () => {
			const file = writeConfig('cfg.yaml', 'workspace:\n  maxWorkspaces: 10\n');
			expect(loadFlowConfig(file).workspace.maxWorkspaces).toBe(10);
		});

		it('falls back to DEFAULT_CONFIG.workspace when section absent', () => {
			const file = writeConfig('cfg.yaml', 'queue:\n  concurrency: 2\n');
			expect(loadFlowConfig(file).workspace).toEqual(DEFAULT_CONFIG.workspace);
		});

		it('default workspace.retainDays is 30', () => {
			expect(DEFAULT_CONFIG.workspace.retainDays).toBe(30);
		});

		it('default workspace.maxWorkspaces is 50', () => {
			expect(DEFAULT_CONFIG.workspace.maxWorkspaces).toBe(50);
		});
	});

	it('partial config: only overrides specified keys, rest falls back to defaults', () => {
		const file = writeConfig('cfg.yaml', 'limits:\n  maxInjectedSteps: 10\n');
		const config = loadFlowConfig(file);
		expect(config.limits.maxInjectedSteps).toBe(10);
		expect(config.limits.maxStepsPerExecution).toBe(DEFAULT_CONFIG.limits.maxStepsPerExecution);
		expect(config.queue).toEqual(DEFAULT_CONFIG.queue);
	});
});
