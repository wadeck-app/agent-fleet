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
	it('are all registered by the dsl-lib entries, under the flow: prefix', () => {
		const registered = new Set(entries.map(entry => `flow:${entry.name}`));
		const used = new Set(
			readdirSync(viewsDir)
				.filter(file => /\.ya?ml$/.test(file))
				.flatMap(file => collectTypes(load(readFileSync(join(viewsDir, file), 'utf8'))))
				.filter(type => type.includes(':'))
		);
		expect([...used].sort()).toEqual(['flow:MarkdownText', 'flow:RunList']);
		for (const type of used) expect(registered, `${type} is used in a view but not registered`).toContain(type);
	});

	it('declares the props of MarkdownText as known keys, so the DSL validator accepts them', () => {
		const entry = entries.find(candidate => candidate.name === 'MarkdownText');
		expect(entry?.knownKeys).toEqual(['text', 'maxHeight']);
	});

	it('declares the props of RunList as known keys', () => {
		const entry = entries.find(candidate => candidate.name === 'RunList');
		expect(entry?.knownKeys).toEqual(['runs', 'to', 'emptyMessage']);
	});
});
