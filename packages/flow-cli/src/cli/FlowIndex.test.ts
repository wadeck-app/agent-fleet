import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '../../..');
const flowIndexPath = path.join(__dirname, 'FlowIndex.ts');

function resolveTsx(): string | undefined {
	const require = createRequire(path.join(packageDir, 'package.json'));
	try {
		return require.resolve('tsx/dist/cli.mjs');
	} catch {
		let dir = packageDir;
		for (let i = 0; i < 4; i++) {
			const candidate = path.resolve(dir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
			if (fs.existsSync(candidate)) return candidate;
			dir = path.resolve(dir, '..');
		}
		return undefined;
	}
}

describe('unknown command handler', () => {
	it('unknown command writes to stdout', () => {
		const tsxPath = resolveTsx();
		if (!tsxPath) {
			console.warn('tsx not found — skipping unknown command integration test');
			return;
		}

		const result = spawnSync(process.execPath, [tsxPath, flowIndexPath, 'totally-unknown-xyz'], {
			encoding: 'utf8',
			timeout: 30000,
			env: { ...process.env },
		});
		expect(result.stdout).toContain('[flow] Unknown command: totally-unknown-xyz');
		expect(result.status).toBe(1);
	});

	it('flow logs command exists and writes to stdout (not silence)', () => {
		const tsxPath = resolveTsx();
		if (!tsxPath) {
			console.warn('tsx not found — skipping flow logs integration test');
			return;
		}

		// flow logs with no log file should write SOMETHING to stdout (not silence)
		const result = spawnSync(process.execPath, [tsxPath, flowIndexPath, 'logs'], {
			encoding: 'utf8',
			timeout: 30000,
			env: { ...process.env },
		});
		// The "no log file" message should appear on stdout (not just stderr)
		expect(result.stdout).toContain('[flow]');
		// Should NOT exit with code 1 (unknown command)
		expect(result.status).not.toBe(1);
	});
});

describe('flow --pid', () => {
	it('does not crash with "unknown option --pid"', () => {
		const tsxPath = resolveTsx();
		if (!tsxPath) {
			console.warn('tsx not found — skipping --pid integration test');
			return;
		}

		const result = spawnSync(process.execPath, [tsxPath, flowIndexPath, '--pid'], {
			encoding: 'utf8',
			timeout: 30000,
			env: { ...process.env },
		});

		const combinedOutput = (result.stdout ?? '') + (result.stderr ?? '');
		expect(combinedOutput).not.toContain("unknown option '--pid'");
		expect(combinedOutput).not.toContain('unknown option');
		// exit code 2 means daemon not running -- that's acceptable, not an error for this test
		expect(result.status).not.toBe(1);
	});
});
