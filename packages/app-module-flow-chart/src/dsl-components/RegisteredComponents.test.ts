import { load } from 'js-yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import entries from './index.js';

const viewsDir = join(dirname(fileURLToPath(import.meta.url)), '../dsl-views');

/** Every `$type` value, at any depth. */
function collectTypes(node: unknown, found: string[] = []): string[] {
	if (Array.isArray(node)) {
		for (const child of node) collectTypes(child, found);
	} else if (node !== null && typeof node === 'object') {
		for (const [name, child] of Object.entries(node)) {
			if (name === '$type' && typeof child === 'string') found.push(child);
			collectTypes(child, found);
		}
	}
	return found;
}

describe('custom components used by the views', () => {
	it('are all registered by the dsl-lib entries, under the flow-chart: prefix', () => {
		const registered = new Set(entries.map(entry => `flow-chart:${entry.name}`));
		const used = new Set(
			readdirSync(viewsDir)
				.filter(file => /\.ya?ml$/.test(file))
				.flatMap(file => collectTypes(load(readFileSync(join(viewsDir, file), 'utf8'))))
				.filter(type => type.includes(':'))
		);
		expect([...used].sort()).toEqual(['flow-chart:FlowChartLink', 'flow-chart:FlowGraph']);
		for (const type of used) expect(registered, `${type} is used in a view but not registered`).toContain(type);
	});

	it('read the ids the views pass (knownKeys), so the DSL validator accepts them', () => {
		const keys = Object.fromEntries(entries.map(e => [e.name, e.knownKeys]));
		expect(keys['FlowGraph']).toEqual(['executionId', 'flowId']);
		expect(keys['FlowChartLink']).toEqual(['target', 'executionId', 'flowId']);
	});
});
