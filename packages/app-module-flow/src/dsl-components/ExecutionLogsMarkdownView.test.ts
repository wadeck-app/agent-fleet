import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import entries from './index.js';

const view = load(
	readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../dsl-views/execution-logs-page.yaml'), 'utf8')
) as { sections: Record<string, unknown>[] };
const table = view.sections.find(section => section['$type'] === 'DataTable')!;

describe('execution logs page: messages rendered as markdown', () => {
	it('opens a row panel with the markdown the route serves, only for rows the route marks expandable', () => {
		expect(table['expansionCondition']).toBe('expandable');
		expect(table['expansion']).toEqual({
			$type: 'flow:MarkdownText',
			text: '$ctx.row.markdown',
			maxHeight: '30rem',
		});
	});

	it('keeps the cell a one-line plain preview, never the whole message', () => {
		const columns = table['columns'] as { key: string }[];
		expect(columns.map(column => column.key)).toContain('preview');
		expect(columns.map(column => column.key)).not.toContain('message');
	});

	it('uses a component the dsl-lib registers, with only keys it declares', () => {
		const entry = entries.find(candidate => candidate.name === 'MarkdownText');
		expect(entry).toBeDefined();
		const expansion = table['expansion'] as Record<string, unknown>;
		const used = Object.keys(expansion).filter(key => !key.startsWith('$'));
		expect(used.sort()).toEqual([...(entry?.knownKeys ?? [])].sort());
	});
});
