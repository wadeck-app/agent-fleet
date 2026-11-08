import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// The dsl-lib is bundled for the browser. The 'flow-core' barrel re-exports node-only modules (node:fs, node:http...),
// so a VALUE import from it makes `app-core-cli package` fail at bundle time (tsc and the unit tests do not notice).
// Value imports must come from the browser-safe subpath 'flow-core/graph-tree'; the barrel is for `import type` only.
describe('dsl-components imports', () => {
	const dir = __dirname;
	const sources = fs
		.readdirSync(dir)
		.filter(name => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name));

	it.each(sources)('%s takes no value import from the flow-core barrel', name => {
		const text = fs.readFileSync(path.join(dir, name), 'utf8');
		const offending = [...text.matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s+'flow-core';/gs)]
			.map(match => match[1] ?? '')
			// `import { type A, type B }` has no runtime part either.
			.filter(clause => !/^\{\s*(type\s+\w+\s*,?\s*)+\}$/s.test(clause));
		expect(offending, `${name}: use 'flow-core/graph-tree' for values`).toEqual([]);
	});
});
