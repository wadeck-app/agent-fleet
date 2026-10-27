import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { findDirectProcessApiUses } from './assertNoDirectProcessApi';

describe('findDirectProcessApiUses', () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
	});

	function sourceFile(content: string): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-api-guard-'));
		dirs.push(dir);
		const file = path.join(dir, 'Sample.ts');
		fs.writeFileSync(file, content);
		return file;
	}

	it('flags runtime imports of child_process and ProcessTreeKiller', () => {
		const file = sourceFile(
			[
				"import { spawn } from 'node:child_process';",
				"import { type ChildProcess, execSync } from 'node:child_process';",
				"import { killProcessTree } from './ProcessTreeKiller';",
			].join('\n')
		);

		expect(findDirectProcessApiUses(file)).toHaveLength(3);
	});

	it('accepts type-only imports', () => {
		const file = sourceFile(
			[
				"import type { ChildProcess } from 'node:child_process';",
				"import { type ChildProcess as C, type SpawnOptions } from 'node:child_process';",
				"import * as path from 'node:path';",
			].join('\n')
		);

		expect(findDirectProcessApiUses(file)).toEqual([]);
	});

	it('throws when the file cannot be read', () => {
		expect(() => findDirectProcessApiUses(path.join(os.tmpdir(), 'does-not-exist-process-api.ts'))).toThrow();
	});
});
