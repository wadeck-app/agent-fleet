import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { rule } from './app-module-ascii-only.js';

/** Builds <tmp>/packages/<pkg>/<relative> files and runs fn with absolute paths. */
async function withPackage(
	pkg: string,
	files: Record<string, string>,
	fn: (abs: (relative: string) => string) => Promise<void>
): Promise<void> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ascii-only-test-'));
	try {
		for (const [relative, content] of Object.entries(files)) {
			const target = path.join(root, 'packages', pkg, relative);
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, content, 'utf8');
		}
		await fn(relative => path.join(root, 'packages', pkg, relative));
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
}

describe('local/app-module-ascii-only', () => {
	it('returns no violation for a clean ASCII file', async () => {
		await withPackage('app-module-x', { 'src/a.ts': 'export const a = "ok"; // plain\n' }, async abs => {
			assert.deepEqual(await rule.check([abs('src/a.ts')], {}), []);
		});
	});

	it('flags a check mark with file, line, character and U+ code', async () => {
		await withPackage('app-module-x', { 'src/a.ts': 'const a = 1;\nconst b = "✓ done";\n' }, async abs => {
			const result = await rule.check([abs('src/a.ts')], {});
			assert.equal(result.length, 1);
			assert.equal(result[0]!.line, 2);
			assert.equal(result[0]!.file, abs('src/a.ts'));
			assert.match(result[0]!.message, /U\+2713/);
			assert.match(result[0]!.message, /✓/);
			assert.match(result[0]!.message, /plain ASCII/);
			assert.match(result[0]!.message, /ok\/FAIL/);
		});
	});

	it('flags the ellipsis character', async () => {
		await withPackage('app-module-x', { 'src/a.ts': 'const a = "Loading…";\n' }, async abs => {
			const result = await rule.check([abs('src/a.ts')], {});
			assert.equal(result.length, 1);
			assert.match(result[0]!.message, /U\+2026/);
		});
	});

	it('flags an em dash', async () => {
		await withPackage('app-module-x', { 'src/a.ts': '// a — b\n' }, async abs => {
			const result = await rule.check([abs('src/a.ts')], {});
			assert.match(result[0]!.message, /U\+2014/);
		});
	});

	it('flags an accented letter in a comment', async () => {
		await withPackage('app-module-x', { 'src/a.ts': '// café\n' }, async abs => {
			const result = await rule.check([abs('src/a.ts')], {});
			assert.equal(result.length, 1);
			assert.match(result[0]!.message, /U\+00E9/);
		});
	});

	it('reports an astral character once with its full code point', async () => {
		await withPackage('app-module-x', { 'src/a.ts': 'const a = "\u{1F600}";\n' }, async abs => {
			const result = await rule.check([abs('src/a.ts')], {});
			assert.equal(result.length, 1);
			assert.match(result[0]!.message, /U\+1F600/);
		});
	});

	it('flags yaml strings', async () => {
		await withPackage('app-module-x', { 'src/dsl-views/v.yaml': 'label: "Run ✓"\n' }, async abs => {
			const result = await rule.check([abs('src/dsl-views/v.yaml')], {});
			assert.equal(result.length, 1);
			assert.equal(result[0]!.line, 1);
		});
	});

	it('flags json', async () => {
		await withPackage('app-module-x', { 'manifest.json': '{ "name": "café" }\n' }, async abs => {
			const result = await rule.check([abs('manifest.json')], {});
			assert.equal(result.length, 1);
		});
	});

	it('scans sibling test files even though the runner excludes them', async () => {
		await withPackage(
			'app-module-x',
			{ 'src/a.ts': 'export const a = 1;\n', 'src/deep/a.test.ts': '// ✓\n', 'src/deep/b.spec.tsx': '// …\n' },
			async abs => {
				const result = await rule.check([abs('src/a.ts')], {});
				const flagged = result.map(v => path.basename(v.file)).sort();
				assert.deepEqual(flagged, ['a.test.ts', 'b.spec.tsx']);
			}
		);
	});

	it('does not report a test file twice when it is also passed in', async () => {
		await withPackage('flow-core', { 'src/a.test.ts': '// ✓\n' }, async abs => {
			const result = await rule.check([abs('src/a.test.ts')], {});
			assert.equal(result.length, 1);
		});
	});

	it('ignores node_modules when discovering tests', async () => {
		await withPackage(
			'flow-core',
			{ 'src/a.ts': 'export const a = 1;\n', 'src/node_modules/x/x.test.ts': '// ✓\n' },
			async abs => {
				assert.deepEqual(await rule.check([abs('src/a.ts')], {}), []);
			}
		);
	});

	it('does not scan test discovery outside the target packages', async () => {
		await withPackage(
			'other-pkg',
			{ 'src/a.ts': 'export const a = 1;\n', 'src/b.test.ts': '// ✓\n' },
			async abs => {
				assert.deepEqual(await rule.check([abs('src/a.ts')], {}), []);
			}
		);
	});
});
