import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { VERSION } from './version.js';

describe('VERSION', () => {
	it('matches CalVer format YYYY.MM.DD-HHmmss-count-hash', () => {
		expect(VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{6}-\d+-[0-9a-zA-Z]+/);
	});
});

describe('version -- non-git directory', () => {
	it('flow --version produces no "fatal:" lines on stderr when run from a non-git directory', () => {
		const __dirname = path.dirname(fileURLToPath(import.meta.url));
		const packageDir = path.resolve(__dirname, '../../..');
		const flowIndexPath = path.join(__dirname, 'FlowIndex.ts');

		// Resolve tsx the same way bin/flow.js does
		const require = createRequire(path.join(packageDir, 'package.json'));
		let tsxPath: string | undefined;
		try {
			tsxPath = require.resolve('tsx/dist/cli.mjs');
		} catch {
			// Fallback: scan upward
			let dir = packageDir;
			for (let i = 0; i < 4; i++) {
				const candidate = path.resolve(dir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
				if (fs.existsSync(candidate)) {
					tsxPath = candidate;
					break;
				}
				dir = path.resolve(dir, '..');
			}
		}

		if (!tsxPath) {
			// Skip gracefully if tsx is not found (should not happen in CI)
			console.warn('tsx not found — skipping non-git stderr test');
			return;
		}

		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-version-test-'));
		try {
			const result = spawnSync(process.execPath, [tsxPath, flowIndexPath, '--version'], {
				cwd: tmpDir,
				encoding: 'utf8',
				timeout: 30000,
				env: { ...process.env },
			});
			expect(result.stderr ?? '').not.toContain('fatal:');
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
