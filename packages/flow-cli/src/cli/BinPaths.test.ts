import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { bin: Record<string, string> };

describe('bin paths', () => {
	for (const [name, relPath] of Object.entries(pkg.bin)) {
		it(`bin "${name}" points to an existing file (${relPath})`, () => {
			const absPath = path.resolve(packageDir, relPath);
			expect(fs.existsSync(absPath), `${relPath} does not exist`).toBe(true);
		});
	}
});
