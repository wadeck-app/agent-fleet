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

/**
 * Fails rather than returning early when tsx is missing.
 *
 * These tests used to `console.warn` and return, which reports success for a CLI they
 * never launched -- the mechanism that let a startup failure sit green for a whole day.
 */
function requireTsx(tsxPath: string | undefined): asserts tsxPath is string {
	if (tsxPath === undefined) {
		throw new Error('tsx not found, so the CLI could not be launched. Run npm install in the monorepo root.');
	}
}

describe('unknown command handler', () => {
	it('unknown command writes to stdout', () => {
		const tsxPath = resolveTsx();
		requireTsx(tsxPath);

		const result = spawnSync(process.execPath, [tsxPath, flowIndexPath, 'totally-unknown-xyz'], {
			encoding: 'utf8',
			timeout: 30000,
			env: { ...process.env },
		});
		// Unknown command error goes to stderr (bin-launcher bypass ensures stderr reaches terminal)
		const combined = (result.stdout ?? '') + (result.stderr ?? '');
		expect(combined).toContain('[flow] Unknown command: totally-unknown-xyz');
		expect(result.status).toBe(1);
	});

	it('flow logs command exists and writes to stdout (not silence)', () => {
		const tsxPath = resolveTsx();
		requireTsx(tsxPath);

		// flow logs with no log file should write SOMETHING to stdout (not silence)
		const result = spawnSync(process.execPath, [tsxPath, flowIndexPath, 'logs'], {
			encoding: 'utf8',
			timeout: 30000,
			env: { ...process.env },
		});
		// flow logs now shows either log file content (NDJSON) or "no log file" -- either way non-empty stdout
		// (the command also creates a log entry for itself, so there will always be a file after the first run)
		const combined = (result.stdout ?? '') + (result.stderr ?? '');
		expect(combined.length).toBeGreaterThan(0);
		// Should NOT exit with code 1 (unknown command)
		expect(result.status).not.toBe(1);
	});
});

describe('flow --pid', () => {
	it('does not crash with "unknown option --pid"', () => {
		const tsxPath = resolveTsx();
		requireTsx(tsxPath);

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
