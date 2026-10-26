import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	DEFAULT_HISTORY_LIMIT,
	FLOW_ACTION_BUTTON_STYLE,
	FLOW_CHART_INDEX_PATH,
	FLOW_EXECUTION_ROW_CONTEXT_FIELDS,
	LOG_LEVELS,
	RETRY_BADGE_VARIANTS,
	buildRunDigest,
	executionPagePath,
	statusTag,
} from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes, makeExec } from 'flow-core/testing';
import { load } from 'js-yaml';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { LOG_STREAM_AB_IDS } from '../commons/LogStreamAbIds.js';
import { DEFAULT_EXECUTION_LOG_LIMIT, MAX_EXECUTION_LOG_LIMIT } from './ExecutionLogRoutes.js';
import backend from './index.js';

const configDirectory = vi.hoisted(() => ({ get: vi.fn<(appName: string) => string>() }));
vi.mock('@wadeck-app/shared-cli/ConfigDir', () => ({ ConfigDir: configDirectory }));

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const viewsDir = join(packageDir, 'src/dsl-views');
const MODULE_API_PREFIX = '/api/modules/flow';
const MODULE_PAGE_PREFIX = '/modules/flow';

interface ManifestPoint {
	kind: string;
	slot: string;
	path?: string;
	width?: number;
	height?: number;
	view: { type: string; value: string };
}
const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8')) as {
	extensionPoints: ManifestPoint[];
	expose?: { slots?: Record<string, { accepts: string[] }> };
};
const SLOT_URL = /^GET \/api\/slots\/flow:([a-z][a-z0-9-]*)$/;

interface ParsedView {
	file: string;
	document: Record<string, unknown>;
}

function parseView(file: string): ParsedView {
	const parsed = load(readFileSync(join(viewsDir, file), 'utf8'));
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${file} must hold a YAML mapping at its root, got ${JSON.stringify(parsed)}.`);
	}
	return { file, document: parsed as Record<string, unknown> };
}

/** Every string stored under `key` ("href", "navigateTo"...) at any depth. */
function collectStrings(node: unknown, key: string, found: string[] = []): string[] {
	if (Array.isArray(node)) {
		for (const child of node) collectStrings(child, key, found);
	} else if (node !== null && typeof node === 'object') {
		for (const [name, child] of Object.entries(node)) {
			if (name === key && typeof child === 'string') found.push(child);
			collectStrings(child, key, found);
		}
	}
	return found;
}

/** The table of the executions (flows-aside shows the flows table first). */
function executionsTableOf(document: unknown): Record<string, unknown> {
	const table = collectNodes(document, 'DataTable').find(
		candidate => candidate['rows'] === '$sources.executions.items'
	);
	if (table === undefined) throw new Error('No DataTable reads $sources.executions.items.');
	return table;
}

/** Every DSL node of the given $type, at any depth. */
function collectNodes(node: unknown, type: string, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
	if (Array.isArray(node)) {
		for (const child of node) collectNodes(child, type, found);
	} else if (node !== null && typeof node === 'object') {
		const record = node as Record<string, unknown>;
		if (record['$type'] === type) found.push(record);
		for (const child of Object.values(record)) collectNodes(child, type, found);
	}
	return found;
}

interface SourceSpec {
	url: string;
	params?: Record<string, string>;
}

function sourcesOf(view: ParsedView): { name: string; spec: SourceSpec }[] {
	const sources = view.document['$sources'];
	if (sources === undefined) return [];
	return Object.entries(sources as Record<string, SourceSpec | string>).map(([name, raw]) => ({
		name,
		spec: typeof raw === 'string' ? { url: raw } : raw,
	}));
}

interface Alternative {
	/** Key of the AbTest variant this document shows; undefined for a view without A/B test. */
	variant: string | undefined;
	document: Record<string, unknown>;
}

/**
 * Copy of `node` where each AbTest is replaced by the view of the variant `choose` names. The page-level `$sources`
 * of a root AbTest stay on the replacing view, like the renderer keeps them for the page.
 */
function resolveVariants(node: unknown, choose: (abTest: Record<string, unknown>) => string, isRoot = true): unknown {
	if (Array.isArray(node)) return node.map(child => resolveVariants(child, choose, false));
	if (node === null || typeof node !== 'object') return node;
	const record = node as Record<string, unknown>;
	if (record['$type'] === 'AbTest') {
		const key = choose(record);
		const variants = record['variants'] as Record<string, { view: Record<string, unknown> }>;
		if (variants[key] === undefined) throw new Error(`AbTest '${String(record['id'])}' has no variant '${key}'.`);
		const view = resolveVariants(variants[key].view, choose, false) as Record<string, unknown>;
		return isRoot && record['$sources'] !== undefined ? { ...view, $sources: record['$sources'] } : view;
	}
	return Object.fromEntries(
		Object.entries(record).map(([name, child]) => [name, resolveVariants(child, choose, false)])
	);
}

/** The view as the user sees it before choosing anything: every AbTest shows its `initial` variant. */
function initialView(file: string): Record<string, unknown> {
	return resolveVariants(parseView(file).document, abTest => String(abTest['initial'])) as Record<string, unknown>;
}

/**
 * One document per variant of each AbTest of the file, the other AbTests staying on their `initial` variant (the
 * combinations a dock lets you pick one dimension at a time), or the view itself without AbTest. With several AbTests
 * the variant is named '<id>=<key>'.
 */
function alternativesOf(file: string): Alternative[] {
	const { document } = parseView(file);
	const abTests = collectNodes(document, 'AbTest');
	if (abTests.length === 0) return [{ variant: undefined, document }];
	return abTests.flatMap(abTest =>
		Object.keys(abTest['variants'] as object).map(variant => ({
			variant: abTests.length === 1 ? variant : `${String(abTest['id'])}=${variant}`,
			document: resolveVariants(document, candidate =>
				candidate === abTest ? variant : String(candidate['initial'])
			) as Record<string, unknown>,
		}))
	);
}

const viewFiles = readdirSync(viewsDir).filter(file => /\.ya?ml$/.test(file));

describe('dsl-views', () => {
	it('holds at least one view (a wrong directory would make every other check vacuous)', () => {
		expect(viewFiles.length).toBeGreaterThan(0);
	});

	it.each(viewFiles)('%s parses as a YAML mapping with a $type', file => {
		expect(parseView(file).document['$type']).toEqual(expect.any(String));
	});

	it('is exactly the set of views the manifest references (no orphan file, no dangling reference)', () => {
		const referenced = manifest.extensionPoints.map(point => point.view.value.replace('./src/dsl-views/', ''));
		for (const file of referenced) {
			expect(existsSync(join(viewsDir, file)), `${file} is referenced by manifest.json but missing`).toBe(true);
		}
		expect([...new Set(referenced)].sort()).toEqual([...viewFiles].sort());
	});
});

describe('action buttons next to an execution', () => {
	// The look is one for every action (own or contributed): the flow-core style, on a ButtonLink (a navigation that reads as a button).
	it('uses the contract style on the Logs button of the detail header, in every variant', () => {
		for (const { variant, document } of alternativesOf('execution-detail-page.yaml')) {
			const logs = collectNodes(document, 'ButtonLink').filter(link => link['label'] === 'Logs');
			expect(logs, String(variant)).toHaveLength(1);
			expect(logs[0], String(variant)).toMatchObject(FLOW_ACTION_BUTTON_STYLE);
		}
	});

	it('uses the contract style on the Logs button of the expanded row panel, as a ButtonLink and not a text Link, in every variant', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const tables = collectNodes(document, 'DataTable').filter(table => table['expansion'] !== undefined);
			expect(tables.length, String(variant)).toBeGreaterThan(0);
			for (const table of tables) {
				expect(collectNodes(table['expansion'], 'Link'), String(variant)).toEqual([]);
				// The own button: Logs, in the contract style (the detail link is an icon column of the table).
				const own = collectNodes(table['expansion'], 'ButtonLink');
				expect(
					own.map(link => link['label']),
					String(variant)
				).toEqual(['Logs']);
				for (const link of own) expect(link, String(variant)).toMatchObject(FLOW_ACTION_BUTTON_STYLE);
			}
		}
	});
});

describe('executions page', () => {
	it('offers the backend default page size first: PageSizeSelect shows options[0] while ?size= is absent', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const selects = collectNodes(document, 'PageSizeSelect');
			expect(selects, `executions-page.yaml (${String(variant)}) has no PageSizeSelect`).toHaveLength(1);
			expect((selects[0]!['options'] as number[])[0]).toBe(DEFAULT_HISTORY_LIMIT);
		}
	});
});

describe('executions page filters (real controls bound to the URL, not links)', () => {
	// The status values GET /executions accepts: the statuses plus "recovered" (completed after an error).
	const ACCEPTED_STATUSES = ['queued', 'running', 'completed', 'failed', 're-queued', 'recovered'];

	it('has a flow search box and a status select in every variant, each back to page 1 when changed', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const [search] = collectNodes(document, 'SearchBar');
			expect(search, String(variant)).toMatchObject({
				urlParam: 'flow',
				placeholder: 'Flow name',
				resetUrlParams: ['page'],
			});
			const [select] = collectNodes(document, 'CompactSelect');
			expect(select, String(variant)).toMatchObject({
				urlParam: 'status',
				ariaLabel: 'Status',
				placeholder: 'Any status',
				resetUrlParams: ['page'],
			});
			const values = (select!['options'] as { value: string }[]).map(option => option.value);
			expect(values.length, String(variant)).toBeGreaterThanOrEqual(5);
			for (const value of values) expect(ACCEPTED_STATUSES, String(variant)).toContain(value);
			expect(collectNodes(document, 'SearchBar'), String(variant)).toHaveLength(1);
			expect(collectNodes(document, 'CompactSelect'), String(variant)).toHaveLength(1);
		}
	});

	it('keeps no status link or button: the filter is the select', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const targets = [...collectNodes(document, 'Link'), ...collectNodes(document, 'ButtonLink')].map(node =>
				JSON.stringify([node['href'], node['to']])
			);
			for (const target of targets) expect(target, String(variant)).not.toContain('status=');
		}
	});

	it('forwards the search to the substring filter of the route, the status and the page size and number', () => {
		const executions = sourcesOf(parseView('executions-page.yaml')).find(source => source.name === 'executions');
		expect(executions?.spec.params).toEqual({
			status: '$urlParam.status',
			flowContains: '$urlParam.flow',
			page: '$urlParam.page',
			limit: '$urlParam.size',
		});
	});

	it('lets the route word the empty table (nothing ran, no match, or a page past the end), in every variant', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			expect(executionsTableOf(document)['emptyMessage'], String(variant)).toBe(
				'$sources.executions.emptyMessage'
			);
		}
	});

	it('titles the executions table with the route count ("110 failed executions"), in every variant', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const section = collectNodes(document, 'Section').find(
				candidate => candidate['title'] === '$sources.executions.countLabel'
			);
			expect(section, String(variant)).toBeDefined();
			expect(collectNodes(section, 'DataTable')[0], String(variant)).toBe(executionsTableOf(document));
		}
	});

	it('resets the page when the page size changes, in every variant', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			expect(collectNodes(document, 'PageSizeSelect')[0], String(variant)).toMatchObject({
				urlParam: 'size',
				options: [20, 50, 100],
				resetUrlParams: ['page'],
			});
			expect(collectNodes(document, 'Pagination')[0], String(variant)).toMatchObject({ urlParam: 'page' });
		}
	});
});

describe('executions table row panel (links of the run, and the per-row extension slot)', () => {
	it('opens a panel per row with the logs and chart links of the run and the execution-row-actions slot, in every variant', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const panel = executionsTableOf(document)['expansion'];
			expect(panel, String(variant)).toBeDefined();
			expect(
				collectNodes(panel, 'ButtonLink').map(link => [link['label'], link['to']]),
				String(variant)
			).toEqual([['Logs', '$ctx.row.logsHref']]);
			// Left to right: the links slot (before Logs), Logs, the actions slot (after Logs).
			const order = ((panel as Record<string, unknown>)['items'] as Record<string, unknown>[]).map(item =>
				item['$type'] === 'ExtensionSlot' ? item['items'] : item['label']
			);
			expect(order, String(variant)).toEqual(['$sources.rowLinks', 'Logs', '$sources.rowActions']);
		}
	});

	it('does not make the rows of the executions table clickable: an icon link column right after the chevron opens the detail', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const table = executionsTableOf(document);
			expect(table, String(variant)).not.toHaveProperty('navigateTo');
			expect(table, String(variant)).not.toHaveProperty('onRowClick');
			const links = (table['columns'] as Record<string, unknown>[]).filter(column => column['type'] === 'link');
			expect(links, String(variant)).toHaveLength(1);
			expect(links[0], String(variant)).toMatchObject({
				position: 'start',
				icon: 'eye',
				label: 'Open details',
			});
			// The renderer fills {executionId} from the row, percent-encoded like the contract's page path.
			const template = String(links[0]!['to']);
			for (const sample of ['abc-123', 'a b/c']) {
				expect(template.replace('{executionId}', encodeURIComponent(sample)), String(variant)).toBe(
					executionPagePath(sample)
				);
			}
		}
	});

	it('declares the row fields a contribution can read', () => {
		expect(FLOW_EXECUTION_ROW_CONTEXT_FIELDS).toEqual(['executionId', 'flowId']);
	});
});

describe('execution logs page', () => {
	const file = 'execution-logs-page.yaml';

	it('reads the logs route of the run in the URL with the filters, the page and the page size', () => {
		const logs = sourcesOf(parseView(file)).find(source => source.name === 'logs');
		expect(logs?.spec.url).toBe('GET /api/modules/flow/executions/{id}/logs');
		expect(logs?.spec.params).toEqual({
			id: '$route.id',
			step: '$urlParam.step',
			level: '$urlParam.level',
			q: '$urlParam.q',
			page: '$urlParam.page',
			limit: '$urlParam.size',
		});
	});

	it('filters by step (the steps of the run), level (the levels the daemon writes) and text, each back to page 1', () => {
		const document = parseView(file).document;
		const [search] = collectNodes(document, 'SearchBar');
		expect(search).toMatchObject({ urlParam: 'q', resetUrlParams: ['page'] });
		const selects = collectNodes(document, 'CompactSelect');
		const byParam = (name: string) => selects.find(select => select['urlParam'] === name)!;
		expect(byParam('step')).toMatchObject({
			ariaLabel: 'Step',
			placeholder: 'All steps',
			options: '$sources.logs.stepOptions',
			resetUrlParams: ['page'],
		});
		expect(byParam('level')).toMatchObject({
			ariaLabel: 'Level',
			placeholder: 'Any level',
			resetUrlParams: ['page'],
		});
		expect((byParam('level')['options'] as { value: string }[]).map(option => option.value)).toEqual([
			...LOG_LEVELS,
		]);
		expect(selects).toHaveLength(2);
	});

	it('guards the select whose options come from the route: CompactSelect throws on undefined options while the route loads', () => {
		const selects = collectNodes(parseView(file).document, 'CompactSelect');
		const dynamic = selects.filter(select => typeof select['options'] === 'string');
		expect(dynamic.length).toBeGreaterThan(0);
		for (const select of dynamic) expect(select['$if'], JSON.stringify(select)).toBe(select['options']);
	});

	it('shows the lines in a table of time (formatted by the shell), level badge, step and message', () => {
		const table = collectNodes(parseView(file).document, 'DataTable')[0]!;
		expect(table['rows']).toBe('$sources.logs.entries');
		const columns = table['columns'] as Record<string, unknown>[];
		expect(columns.map(column => column['key'])).toEqual(['timestamp', 'level', 'stepId', 'preview']);
		expect(columns[0]).toMatchObject({ format: 'time', nowrap: true });
		expect(Object.keys(columns[1]!['badge'] as object)).toEqual(expect.arrayContaining([...LOG_LEVELS]));
		expect(table['emptyMessage']).toBe('$sources.logs.notice');
	});

	it('pages from the end with the backend default page size first and every size within the route maximum', () => {
		const document = parseView(file).document;
		const [size] = collectNodes(document, 'PageSizeSelect');
		const options = size!['options'] as number[];
		expect(options[0]).toBe(DEFAULT_EXECUTION_LOG_LIMIT);
		for (const option of options) expect(option).toBeLessThanOrEqual(MAX_EXECUTION_LOG_LIMIT);
		expect(size).toMatchObject({ urlParam: 'size', resetUrlParams: ['page'] });
		expect(collectNodes(document, 'Pagination')[0]).toMatchObject({ urlParam: 'page' });
	});

	it('shows the recorded failure text and the notice only when the route has some', () => {
		const document = parseView(file).document;
		const viewers = collectNodes(document, 'JsonViewer');
		expect(viewers).toHaveLength(1);
		expect(viewers[0]).toMatchObject({ row: '$sources.logs', field: 'recordedOutput' });
		const gated = JSON.stringify(document);
		expect(gated).toContain('"$if":"$sources.logs.hasRecordedOutput"');
		expect(gated).toContain('"$if":"$sources.logs.hasNotice"');
	});

	it('shows no "values hidden" badge: the route serves what is stored', () => {
		expect(JSON.stringify(parseView(file).document)).not.toMatch(/edactions/);
	});

	describe('log view experiment', () => {
		const [design, ...others] = collectNodes(parseView(file).document, 'AbTest');

		it('declares one flow-logs-design experiment: the stream first (initial), the previous table as the other option', () => {
			expect(others).toEqual([]);
			expect(design).toMatchObject({ id: 'flow-logs-design', initial: 'stream' });
			expect(Object.keys(design!['variants'] as object)).toEqual(['stream', 'table']);
		});

		it('renders every variant: the stream is a flow:LogStream, the table a DataTable with the markdown panel', () => {
			const types = alternativesOf(file).map(({ variant, document }) => ({
				variant,
				stream: collectNodes(document, 'flow:LogStream').length,
				table: collectNodes(document, 'DataTable').length,
			}));
			expect(types).toEqual([
				{ variant: 'stream', stream: 1, table: 0 },
				{ variant: 'table', stream: 0, table: 1 },
			]);
		});

		it('gives the stream exactly the closed props, read from fields the route sends, and waits for the route', async () => {
			const [stream] = collectNodes(parseView(file).document, 'flow:LogStream');
			expect(stream).toMatchObject({
				entries: '$sources.logs.entries',
				steps: '$sources.logs.steps',
				runDurationMs: '$sources.logs.runDurationMs',
				emptyMessage: '$sources.logs.notice',
				// A property the route answers only once it has run: the node is not drawn (and does not refuse) while it loads.
				$if: '$sources.logs.executionId',
			});
			expect(Object.keys(stream!).filter(key => !key.startsWith('$'))).toEqual([
				'entries',
				'steps',
				'runDurationMs',
				'emptyMessage',
			]);
			const fixture = new FlowConfigFixture();
			fixture.addExecution({
				executionId: 'run1',
				startedAt: '2026-08-16T10:00:00.000Z',
				completedAt: '2026-08-16T10:05:00.000Z',
				steps: { a: { status: 'completed' } },
			});
			configDirectory.get.mockReturnValue(fixture.configDir);
			const { routes, ctx } = collectRoutes<ModuleContext>();
			backend(ctx);
			const body = (await callRoute(routes, 'GET /executions/:id/logs', { params: { id: 'run1' }, query: {} }))
				.body as Record<string, unknown>;
			fixture.dispose();
			for (const field of ['entries', 'steps', 'runDurationMs', 'notice', 'executionId']) {
				expect(body, field).toHaveProperty(field);
			}
			expect(body['steps']).toBeInstanceOf(Array);
			expect(body['runDurationMs']).toEqual(expect.any(Number));
		});

		it('keeps the experiments of the stream in code under the flow-logs- prefix', () => {
			for (const id of Object.values(LOG_STREAM_AB_IDS)) expect(id).toMatch(/^flow-logs-[a-z]+$/);
			expect(Object.values(LOG_STREAM_AB_IDS)).not.toContain('flow-logs-design');
		});
	});
});

describe('no back link (the shell has a breadcrumb)', () => {
	it.each(viewFiles)('%s has no Back to ... link', file => {
		for (const { variant, document } of alternativesOf(file)) {
			for (const node of [...collectNodes(document, 'Link'), ...collectNodes(document, 'ButtonLink')]) {
				expect(String(node['label']), `${file} (${String(variant)})`).not.toMatch(/^back\b/i);
			}
		}
	});
});

describe('DataTable columns', () => {
	// Keys dsl-ui 2026.10.19-122 (DATA_TABLE_COLUMN_KEYS) accepts on a data column. Any other key is a compile error
	// there; a shell older than 122 ignores everything but key and label, so each option below must be cosmetic.
	const COLUMN_KEYS = [
		'field',
		'key',
		'label',
		'width',
		'truncate',
		'nowrap',
		'mono',
		'muted',
		'sortable',
		'format',
		'badge',
	];
	const BADGE_VARIANTS = ['default', 'primary', 'success', 'warning', 'danger', 'info'];

	// Keys dsl-ui 2026.10.24-153 accepts on a `type: link` column (icon-only router link, one per row).
	const LINK_COLUMN_KEYS = ['type', 'to', 'label', 'icon', 'position', 'external', 'width'];

	function allColumnsOf(file: string): Record<string, unknown>[] {
		return collectNodes(parseView(file).document, 'DataTable').flatMap(
			table => table['columns'] as Record<string, unknown>[]
		);
	}

	function columnsOf(file: string): Record<string, unknown>[] {
		return allColumnsOf(file).filter(column => column['type'] !== 'link');
	}

	it.each(viewFiles)(
		'%s sets only keys the dsl-ui link column reads, with a label (its tooltip and aria-label)',
		file => {
			for (const column of allColumnsOf(file).filter(candidate => candidate['type'] === 'link')) {
				for (const name of Object.keys(column)) {
					expect(LINK_COLUMN_KEYS, `${file}: column ${JSON.stringify(column)}`).toContain(name);
				}
				expect(column, `${file}: column ${JSON.stringify(column)}`).toHaveProperty('label');
				expect(column, `${file}: column ${JSON.stringify(column)}`).toHaveProperty('to');
			}
		}
	);

	it.each(viewFiles)('%s sets only keys the dsl-ui DataTable reads (any other is a compile error)', file => {
		for (const column of columnsOf(file)) {
			for (const name of Object.keys(column)) {
				expect(COLUMN_KEYS, `${file}: column ${JSON.stringify(column)}`).toContain(name);
			}
		}
	});

	it.each(viewFiles)('%s names the row field with key (a shell older than 122 reads key only)', file => {
		for (const column of columnsOf(file)) {
			expect(column, `${file}: column ${JSON.stringify(column)}`).toHaveProperty('key');
			expect(column).not.toHaveProperty('field');
		}
	});

	it.each(viewFiles)('%s maps badges to known variants', file => {
		for (const column of columnsOf(file)) {
			for (const variant of Object.values((column['badge'] ?? {}) as Record<string, string>)) {
				expect(BADGE_VARIANTS, `${file}: column ${JSON.stringify(column)}`).toContain(variant);
			}
		}
	});
});

describe('timestamps (same text as the rest of app-core: the shell DataTable formats an ISO value)', () => {
	// dsl-ui DataTable `format: datetime` = Intl.DateTimeFormat(undefined, short date + short time), the format of the
	// queue module tables. A view must not show a timestamp any other way: no server-side label, no raw ISO in a Badge.
	const TIMESTAMP_ONLY_KEY = /At$/;

	function everyColumn(): { file: string; variant: string | undefined; column: Record<string, unknown> }[] {
		return viewFiles.flatMap(file =>
			alternativesOf(file).flatMap(({ variant, document }) =>
				collectNodes(document, 'DataTable').flatMap(table =>
					(table['columns'] as Record<string, unknown>[]).map(column => ({ file, variant, column }))
				)
			)
		);
	}

	it('formats every *At column as a datetime, in every A/B variant', () => {
		const dated = everyColumn().filter(({ column }) => TIMESTAMP_ONLY_KEY.test(String(column['key'])));
		// A rename of the keys would make the loop below vacuous.
		expect(dated.length).toBeGreaterThanOrEqual(5);
		for (const { file, variant, column } of dated) {
			expect(column, `${file} (${String(variant)}): ${JSON.stringify(column)}`).toMatchObject({
				format: 'datetime',
			});
		}
	});

	it('reads no precomputed date label (startedLabel, lastStartedLabel): the backend sends ISO 8601 only', () => {
		for (const file of viewFiles) {
			expect(JSON.stringify(parseView(file).document), file).not.toMatch(/(started|Started)Label/);
		}
		expect(
			everyColumn().filter(({ column }) => /StartedLabel$|^startedLabel$/.test(String(column['key'])))
		).toEqual([]);
	});

	it('never puts a timestamp in a Badge or a StatTile (they would show the raw ISO text)', () => {
		for (const file of viewFiles) {
			for (const { variant, document } of alternativesOf(file)) {
				for (const node of [...collectNodes(document, 'Badge'), ...collectNodes(document, 'StatTile')]) {
					const text = JSON.stringify([node['label'], node['value']]);
					expect(text, `${file} (${String(variant)})`).not.toMatch(/At"/);
				}
			}
		}
	});
});

describe('executions page layout', () => {
	it('shows the executions table before the flows summary, which asks for a short list', () => {
		const view = { file: 'executions-page.yaml', document: initialView('executions-page.yaml') };
		const tables = collectNodes(view.document, 'DataTable');
		expect(tables.map(table => table['rows'])).toEqual(['$sources.executions.items', '$sources.flows.flows']);
		const flows = sourcesOf(view).find(source => source.name === 'flows');
		expect(flows?.spec.url).toMatch(/\?limit=\d+$/);
	});

	it('shows the raw status and a one-line error excerpt, columns the executions route sends', () => {
		const table = collectNodes(initialView('executions-page.yaml'), 'DataTable')[0]!;
		const keys = (table['columns'] as { key: string }[]).map(column => column.key);
		expect(keys).toContain('statusLabel');
		expect(keys).not.toContain('lastError');
	});

	it('has five columns, the full flow name truncated by the column (ellipsis and tooltip), the version on one line and the run id kept visible', () => {
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const columns = (executionsTableOf(document)['columns'] as Record<string, unknown>[]).filter(
				column => column['type'] !== 'link'
			);
			expect(
				columns.map(column => column['key']),
				String(variant)
			).toEqual(['startedAt', 'flowId', 'versionLabel', 'executionId', 'statusLabel']);
			expect(columns[1], String(variant)).toMatchObject({ truncate: true, mono: true });
			expect(columns[2], String(variant)).toMatchObject({ label: 'Version', nowrap: true, mono: true });
			expect(columns[3], String(variant)).toMatchObject({ nowrap: true, mono: true });
			expect(JSON.stringify(columns), String(variant)).not.toContain('runLabel');
		}
	});

	it('keeps When and Status on one line and badges every bare status word the route can send', () => {
		const table = collectNodes(initialView('executions-page.yaml'), 'DataTable')[0]!;
		const columns = table['columns'] as Record<string, unknown>[];
		const byKey = (key: string) => columns.find(column => column['key'] === key)!;
		expect(byKey('startedAt')).toMatchObject({ nowrap: true, format: 'datetime' });
		expect(byKey('statusLabel')).toMatchObject({ nowrap: true });
		const badge = byKey('statusLabel')['badge'] as Record<string, string>;
		// The cell text stays the status word (older shells show it as is); the badge only colours a cell whose text is exactly a key.
		for (const status of ['queued', 'running', 'completed', 'failed', 're-queued']) {
			expect(Object.keys(badge), status).toContain(statusTag(status));
		}
		expect(badge[statusTag('completed')]).toBe('success');
		expect(badge[statusTag('failed')]).toBe('danger');
	});

	it('truncates the flow name of the flows summary', () => {
		const table = collectNodes(initialView('executions-page.yaml'), 'DataTable')[1]!;
		const flow = (table['columns'] as Record<string, unknown>[]).find(column => column['key'] === 'flowId');
		expect(flow).toMatchObject({ truncate: true });
	});
});

describe('execution detail page', () => {
	it('shows no "values hidden" badge', () => {
		expect(JSON.stringify(initialView('execution-detail-page.yaml'))).not.toMatch(/edactions/);
	});

	it('has no A/B test left: one design, the steps table', () => {
		expect(collectNodes(parseView('execution-detail-page.yaml').document, 'AbTest')).toEqual([]);
		expect(collectNodes(parseView('executions-page.yaml').document, 'AbTest')).toEqual([]);
	});

	it('orders the header buttons [contributed links] [Logs] [contributed actions]', () => {
		const document = initialView('execution-detail-page.yaml');
		const group = collectNodes(document, 'HorizontalStack').find(stack =>
			(stack['items'] as Record<string, unknown>[]).some(item => item['label'] === 'Logs')
		)!;
		expect(
			(group['items'] as Record<string, unknown>[]).map(item =>
				item['$type'] === 'ExtensionSlot' ? item['items'] : item['label']
			)
		).toEqual(['$sources.links', 'Logs', '$sources.actions']);
	});

	it('badges the retries with exactly the texts and colours of flow-core RETRY_BADGE_VARIANTS', () => {
		const steps = collectNodes(initialView('execution-detail-page.yaml'), 'DataTable').find(
			table => table['rows'] === '$sources.execution.steps'
		)!;
		const retries = (steps['columns'] as Record<string, unknown>[]).find(column => column['key'] === 'retryLabel');
		expect(retries).toMatchObject({ label: 'Retries', nowrap: true });
		expect(retries!['badge']).toEqual(RETRY_BADGE_VARIANTS);
	});

	it('colours the status badge from the variant the route sends and lists display-ready step columns', () => {
		const document = initialView('execution-detail-page.yaml');
		const badges = collectNodes(document, 'Badge');
		expect(badges[0]).toMatchObject({
			label: '$sources.execution.statusText',
			variant: '$sources.execution.statusVariant',
		});
		const steps = collectNodes(document, 'DataTable').find(table => table['rows'] === '$sources.execution.steps')!;
		expect((steps['columns'] as { key: string }[]).map(column => column.key)).toEqual([
			'stepId',
			'statusLabel',
			'duration',
			'costLabel',
			'retryLabel',
			'startedAt',
		]);
		const cost = (steps['columns'] as Record<string, unknown>[]).find(column => column['key'] === 'costLabel');
		expect(cost).toMatchObject({ label: 'Cost', nowrap: true });
	});

	it('shows when the run started and ended in a one-row table the shell formats, in every variant', () => {
		for (const { variant, document } of alternativesOf('execution-detail-page.yaml')) {
			const timing = collectNodes(document, 'DataTable').filter(
				table => table['rows'] === '$sources.execution.timing'
			);
			expect(timing, String(variant)).toHaveLength(1);
			expect(timing[0]!['columns'], String(variant)).toEqual([
				{ key: 'startedAt', label: 'Started', format: 'datetime', nowrap: true },
				{ key: 'completedAt', label: 'Finished', format: 'datetime', nowrap: true },
				{ key: 'version', label: 'Version', nowrap: true, mono: true },
				{ key: 'totalCost', label: 'Total cost', nowrap: true },
				{ key: 'definition', label: 'Definition', muted: true },
			]);
		}
	});

	it('keeps the inputs and outputs of the steps in a collapsed section of the steps-table design', () => {
		const document = initialView('execution-detail-page.yaml');
		const sections = collectNodes(document, 'Collapsible').filter(node => node['title'] === 'Inputs / outputs');
		expect(sections).toHaveLength(1);
		expect(sections[0]).toMatchObject({ defaultOpen: false });
		expect(collectNodes(sections[0]!, 'JsonViewer')[0]).toMatchObject({ field: 'ioText' });
	});

	it('links to the logs of the run in every variant', () => {
		for (const { variant, document } of alternativesOf('execution-detail-page.yaml')) {
			const logs = collectNodes(document, 'ButtonLink').filter(link => link['label'] === 'Logs');
			expect(logs, String(variant)).toHaveLength(1);
			expect(logs[0], String(variant)).toMatchObject({ to: '$sources.execution.logsHref' });
		}
	});

	it('opens an attempts table under a step with several attempts or an unknown cost, in every variant', () => {
		for (const { variant, document } of alternativesOf('execution-detail-page.yaml')) {
			const steps = collectNodes(document, 'DataTable').find(
				table => table['rows'] === '$sources.execution.steps'
			)!;
			expect(steps['expansionCondition'], String(variant)).toBe('expandable');
			const nested = collectNodes(steps['expansion'], 'DataTable');
			expect(nested, String(variant)).toHaveLength(1);
			expect(nested[0]!['rows'], String(variant)).toBe('$ctx.row.attemptRows');
			expect(
				(nested[0]!['columns'] as { key: string }[]).map(column => column.key),
				String(variant)
			).toEqual(['n', 'origin', 'duration', 'cost', 'tokens', 'turns', 'toolCalls', 'endReason']);
			// The reason of an unknown cost is a text under the table: a column would widen the whole steps table.
			const notes = collectNodes(steps['expansion'], 'flow:MarkdownText');
			expect(notes, String(variant)).toHaveLength(1);
			expect(notes[0], String(variant)).toMatchObject({ $if: '$ctx.row.costNotes', text: '$ctx.row.costNotes' });
		}
	});

	it('badges the step status words in every variant', () => {
		for (const { variant, document } of alternativesOf('execution-detail-page.yaml')) {
			const steps = collectNodes(document, 'DataTable').find(
				table => table['rows'] === '$sources.execution.steps'
			)!;
			const status = (steps['columns'] as Record<string, unknown>[]).find(
				column => column['key'] === 'statusLabel'
			);
			expect(status, String(variant)).toMatchObject({ nowrap: true });
			expect(Object.keys(status!['badge'] as object), String(variant)).toEqual(
				expect.arrayContaining(['ok', 'FAILED', 'running', 'waiting', 'retry', 'pending'])
			);
		}
	});
});

describe('executions page flow filter', () => {
	it('links each flow row to ?flow=<flowId>, the URL parameter the executions source forwards', () => {
		const view = parseView('executions-page.yaml');
		expect(collectStrings(view.document, 'navigateTo')).toContain('/modules/flow/executions?flow={flowId}');
		const executions = sourcesOf(view).find(source => source.name === 'executions');
		expect(executions?.spec.params?.['flowContains']).toBe('$urlParam.flow');
	});
});

describe('every $sources url is served by the backend', () => {
	let registered: Set<string>;

	beforeAll(() => {
		// The module is not loaded by app-core here: only the routes it would register matter.
		const fixture = new FlowConfigFixture();
		configDirectory.get.mockReturnValue(fixture.configDir);
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		registered = new Set(routes.keys());
		fixture.dispose();
	});

	it.each(viewFiles)('%s', file => {
		const view = parseView(file);
		for (const { name, spec } of sourcesOf(view)) {
			// A slot source is served by app-core itself (GET /api/slots/flow:<slot>), checked in 'extension slots'.
			if (SLOT_URL.test(spec.url)) continue;
			const match = /^GET \/api\/modules\/flow(\/[^?\s]*)(\?.*)?$/.exec(spec.url);
			expect(
				match,
				`$sources.${name} of ${file}: '${spec.url}' must be 'GET ${MODULE_API_PREFIX}/<route>' (this module only reads)`
			).not.toBeNull();
			const subPath = match![1]!;
			for (const placeholder of [...subPath.matchAll(/\{(\w+)\}/g)].map(m => m[1]!)) {
				expect(
					Object.keys(spec.params ?? {}),
					`$sources.${name} of ${file}: '{${placeholder}}' in the url has no entry in params`
				).toContain(placeholder);
			}
			const route = `GET ${subPath.replace(/\{(\w+)\}/g, ':$1')}`;
			expect(
				registered.has(route),
				`$sources.${name} of ${file} calls '${route}' but the backend registers: ${[...registered].sort().join(', ')}`
			).toBe(true);
		}
	});

	it('has at least one source to check (views that stopped declaring sources would pass vacuously)', () => {
		expect(viewFiles.flatMap(file => sourcesOf(parseView(file))).length).toBeGreaterThan(0);
	});
});

describe('every link and row navigation lands on a page of the manifest', () => {
	const pagePaths = manifest.extensionPoints.filter(point => point.kind === 'page').map(point => point.path!);

	function pageMatching(target: string): string | undefined {
		const path = target.split('?')[0]!.replace(/\{\w+\}/g, 'x');
		return pagePaths.find(pagePath => {
			const pattern = new RegExp(`^${MODULE_PAGE_PREFIX}${pagePath.replace(/:\w+/g, '[^/]+')}$`);
			return pattern.test(path);
		});
	}

	it.each(viewFiles)('%s', file => {
		const view = parseView(file);
		const targets = [...collectStrings(view.document, 'href'), ...collectStrings(view.document, 'navigateTo')];
		for (const target of targets.filter(candidate => !candidate.startsWith('$'))) {
			expect(
				pageMatching(target),
				`${file}: '${target}' matches no page of manifest.json (${pagePaths.join(', ')}) under ${MODULE_PAGE_PREFIX}`
			).toBeDefined();
		}
	});

	it('uses $route.<name> only on pages whose manifest path declares :<name>', () => {
		for (const point of manifest.extensionPoints) {
			const view = parseView(point.view.value.replace('./src/dsl-views/', ''));
			const used = new Set(
				JSON.stringify(view.document)
					.match(/\$route\.\w+/g)
					?.map(reference => reference.slice('$route.'.length))
			);
			const declared = new Set([...(point.path ?? '').matchAll(/:(\w+)/g)].map(m => m[1]));
			for (const name of used) {
				expect(
					declared,
					`${view.file} reads $route.${name} but its manifest path is '${point.path}'`
				).toContain(name);
			}
		}
	});
});

describe('links read from a row or from the detail resolve to a page of the manifest', () => {
	const pagePaths = manifest.extensionPoints.filter(point => point.kind === 'page').map(point => point.path!);

	function isPage(target: string): boolean {
		return pagePaths.some(
			pagePath =>
				new RegExp(`^${MODULE_PAGE_PREFIX}${pagePath.replace(/:\w+/g, '[^/]+')}$`).test(
					target.split('?')[0]!
				) ||
				// The chart of a run is a page of the flow-chart module, not of this manifest.
				/^\/modules\/flow-chart\/flows\/runs\/[^/]+$/.test(target)
		);
	}

	it('sends, in the rows and in the detail, every field the views use as a link target, each a real page path', async () => {
		const fixture = new FlowConfigFixture();
		fixture.addExecution({ executionId: 'abc12345', steps: { a: { status: 'completed' } } });
		configDirectory.get.mockReturnValue(fixture.configDir);
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		const list = (await callRoute(routes, 'GET /executions', { query: {} })).body as {
			items: Record<string, unknown>[];
		};
		const detail = (await callRoute(routes, 'GET /executions/:id', { params: { id: 'abc12345' } })).body as Record<
			string,
			unknown
		>;
		fixture.dispose();

		const resolved: string[] = [];
		for (const file of viewFiles) {
			for (const { document } of alternativesOf(file)) {
				const targets = [...collectStrings(document, 'href'), ...collectStrings(document, 'to')].filter(
					target =>
						// The dashboard widget has its own test below.
						/^\$(ctx\.row|sources\.execution)\./.test(target)
				);
				for (const target of targets) {
					const row = target.startsWith('$ctx.row.') ? list.items[0]! : detail;
					const field = target.replace(/^\$(ctx\.row|sources\.execution)\./, '');
					expect(row[field], `${file}: '${target}' is not a field the route sends`).toEqual(
						expect.any(String)
					);
					expect(isPage(String(row[field])), `${file}: '${target}' sends '${String(row[field])}'`).toBe(true);
					resolved.push(target);
				}
			}
		}
		expect(new Set(resolved)).toEqual(new Set(['$ctx.row.logsHref', '$sources.execution.logsHref']));
	});
});

describe('extension slots', () => {
	const exposed = Object.keys(manifest.expose?.slots ?? {});

	/** Slot names a document embeds: ExtensionSlot items point at a source that GETs /api/slots/flow:<name>. */
	function embeddedSlots(file: string, document: Record<string, unknown>): string[] {
		const view = { file, document };
		const sources = new Map(sourcesOf(view).map(source => [source.name, source.spec.url]));
		return collectNodes(view.document, 'ExtensionSlot').map(node => {
			const items = String(node['items']);
			const url = sources.get(items.replace('$sources.', ''));
			const match = url === undefined ? null : SLOT_URL.exec(url);
			if (!items.startsWith('$sources.') || match === null) {
				throw new Error(
					`${file}: ExtensionSlot items '${items}' must be a $sources entry 'GET /api/slots/flow:<slot>', got '${String(url)}'`
				);
			}
			return match[1]!;
		});
	}

	it.each([
		['execution-detail-page.yaml', ['execution-actions', 'execution-links']],
		['executions-page.yaml', ['execution-row-actions', 'execution-row-links', 'executions-actions']],
		['execution-logs-page.yaml', []],
	])(
		'%s embeds %j in every A/B variant: choosing a design must not drop the buttons other modules add',
		(file, slots) => {
			for (const { variant, document } of alternativesOf(file)) {
				expect([...embeddedSlots(file, document)].sort(), `variant ${String(variant)}`).toEqual(slots);
			}
		}
	);

	it('embeds only slots the manifest exposes, and every exposed slot is embedded somewhere', () => {
		const embedded = viewFiles.flatMap(file =>
			alternativesOf(file).flatMap(({ document }) => embeddedSlots(file, document))
		);
		for (const name of embedded) expect(exposed, `slot ${name} is not in expose.slots`).toContain(name);
		for (const name of exposed) expect(embedded, `slot ${name} is exposed but no view embeds it`).toContain(name);
	});

	it('keeps the PageHeader subtitle: headerActions would drop it, so the slot sits in its own row', () => {
		for (const file of ['execution-detail-page.yaml', 'executions-page.yaml']) {
			for (const header of collectNodes(parseView(file).document, 'PageHeader')) {
				expect(header, file).not.toHaveProperty('headerActions');
			}
		}
	});
});

describe('dashboard widget', () => {
	const widgetPoint = manifest.extensionPoints.find(point => point.kind === 'widget' && point.slot === 'dashboard');
	const widgetFile = widgetPoint!.view.value.replace('./src/dsl-views/', '');
	const widget = parseView(widgetFile);

	// What the widget route sends for a state where the table has rows (a failed, a running and a finished run).
	const NOW = Date.parse('2026-10-22T12:00:00.000Z');
	const runs = [
		makeExec({
			executionId: 'live',
			flowId: 'lint',
			status: 'running',
			completedAt: null,
			startedAt: '2026-10-22T11:50:00.000Z',
		}),
		makeExec({ executionId: 'bad', status: 'failed', lastError: 'boom', startedAt: '2026-10-22T11:00:00.000Z' }),
		makeExec({ executionId: 'good', startedAt: '2026-10-22T10:00:00.000Z' }),
	];
	const recentBody = buildRunDigest(runs, NOW) as unknown as Record<string, unknown>;

	/** Value at `a.b.c` of the body of the source; `found: false` when a key on the way is missing (null values do exist). */
	function readSource(reference: string): { found: boolean; value: unknown } {
		const [source, ...path] = reference.replace('$sources.', '').split('.');
		expect(source, reference).toBe('recent');
		let current: unknown = recentBody;
		for (const key of path) {
			if (current === null || typeof current !== 'object' || !(key in current))
				return { found: false, value: undefined };
			current = (current as Record<string, unknown>)[key];
		}
		return { found: current !== undefined, value: current };
	}

	it('reads the executions digest, nothing else', () => {
		expect(widgetPoint, 'manifest.json declares no dashboard widget').toBeDefined();
		expect(sourcesOf(widget).map(source => source.spec.url)).toEqual([
			`GET ${MODULE_API_PREFIX}/widgets/executions`,
		]);
	});

	it('is one design: no A/B test, three condensed counters on one row, the bars, the latest runs, the buttons', () => {
		expect(collectNodes(widget.document, 'AbTest')).toEqual([]);
		const tiles = collectNodes(widget.document, 'StatTile');
		expect(tiles.map(tile => tile['label'])).toEqual(['Running', 'Failed', 'Total']);
		const rows = collectNodes(widget.document, 'HorizontalStack').filter(row =>
			(row['items'] as Record<string, unknown>[]).some(item => item['$type'] === 'StatTile')
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]!['items']).toHaveLength(3);
		expect(collectNodes(widget.document, 'flow:RunBars')).toHaveLength(1);
		// The dsl-ui Chart draws nothing for a day without run: two busy days left five seventh of the tile empty.
		expect(collectNodes(widget.document, 'Chart')).toEqual([]);
		expect(collectNodes(widget.document, 'flow:RunList').map(list => list['runs'])).toEqual([
			'$sources.recent.latest',
		]);
		// A table cannot shrink under its content: in a narrow card it scrolled sideways and hid the time.
		expect(collectNodes(widget.document, 'DataTable')).toEqual([]);
	});

	it('links only to pages that exist: the executions list, a run, the workers, the flow charts', () => {
		const targets = [
			// The numbers (StatTile href): Running, Failed, Total.
			`${MODULE_PAGE_PREFIX}/executions?status=running`,
			`${MODULE_PAGE_PREFIX}/executions?status=failed`,
			`${MODULE_PAGE_PREFIX}/executions`,
			// The bars of the chart, a run of the list, the buttons.
			`${MODULE_PAGE_PREFIX}/executions`,
			`${MODULE_PAGE_PREFIX}/executions/{executionId}`,
			`${MODULE_PAGE_PREFIX}/executions`,
			`${MODULE_PAGE_PREFIX}/workers`,
			FLOW_CHART_INDEX_PATH,
		];
		expect([...collectStrings(widget.document, 'href'), ...collectStrings(widget.document, 'to')]).toEqual(targets);
	});

	it('makes each number a link to the executions page filtered on a status that page offers (Total: unfiltered)', () => {
		const tiles = collectNodes(widget.document, 'StatTile');
		const hrefs = Object.fromEntries(tiles.map(tile => [String(tile['label']), tile['href']]));
		expect(hrefs).toEqual({
			Running: `${MODULE_PAGE_PREFIX}/executions?status=running`,
			Failed: `${MODULE_PAGE_PREFIX}/executions?status=failed`,
			Total: `${MODULE_PAGE_PREFIX}/executions`,
		});
		const selects = collectNodes(parseView('executions-page.yaml').document, 'CompactSelect');
		const status = selects.find(select => select['urlParam'] === 'status');
		const offered = (status!['options'] as { value: string }[]).map(option => option.value);
		for (const href of Object.values(hrefs)) {
			const value = new URL(String(href), 'http://x').searchParams.get('status');
			if (value !== null) expect(offered, String(href)).toContain(value);
		}
	});

	it('offers the three buttons in the style of the other action buttons of the module', () => {
		const buttons = collectNodes(widget.document, 'ButtonLink');
		expect(buttons.map(button => button['label'])).toEqual(['Runs', 'Workers', 'Charts']);
		for (const button of buttons) expect(button, String(button['label'])).toMatchObject(FLOW_ACTION_BUTTON_STYLE);
	});

	it('reads only fields the route sends, with the data a busy install produces (a typo would render empty)', () => {
		const references = JSON.stringify(widget.document).match(/\$sources\.\w+\.\w+/g) ?? [];
		expect(references.length).toBeGreaterThan(0);
		for (const reference of references) {
			expect(readSource(reference).found, reference).toBe(true);
		}
	});

	it('gives the latest runs every field the list reads, an empty message and no style key', () => {
		const [list] = collectNodes(widget.document, 'flow:RunList');
		expect(list!['emptyMessage']).toEqual(expect.any(String));
		expect(Object.keys(list!).filter(key => !key.startsWith('$'))).toEqual(['runs', 'to', 'emptyMessage']);
		const rows = readSource(String(list!['runs'])).value as Record<string, unknown>[];
		expect(rows.length, 'the latest runs have no row to check').toBeGreaterThan(0);
		for (const field of ['executionId', 'flowId', 'statusLabel', 'startedAt']) {
			expect(Object.keys(rows[0]!), field).toContain(field);
		}
	});

	it('gives the daily bars the 7 days of the digest and no style key', () => {
		const [bars] = collectNodes(widget.document, 'flow:RunBars');
		expect(Object.keys(bars!).filter(key => !key.startsWith('$'))).toEqual(['days', 'to']);
		const days = readSource(String(bars!['days'])).value as Record<string, unknown>[];
		expect(days).toHaveLength(7);
		for (const field of ['dayStart', 'completed', 'failed']) expect(Object.keys(days[0]!), field).toContain(field);
	});

	// app-core grid: square cells of 100px, 1 to 12 cells. Without a width the card takes 2 cells and widens itself when its
	// content overflows, which is how it became 3 cells wide: declared, the layout no longer depends on that.
	it('declares the size of its card in grid cells (3 wide, 4 high: the content at 332px takes 4 rows)', () => {
		expect(widgetPoint).toMatchObject({ width: 3, height: 4 });
	});

	it('draws the time and the status itself in flow:RunList, not with a stray RelativeDate or Badge', () => {
		expect(collectNodes(widget.document, 'RelativeDate')).toEqual([]);
		expect(collectNodes(widget.document, 'Badge')).toEqual([]);
	});
});

describe('views keys', () => {
	it.each(viewFiles)("%s holds no key the shell's dsl-ui does not know", async file => {
		const { findUnknownKeys, knownKeys } = await loadKeyCheck();
		// The dsl-lib components of this module (`flow:` prefix) are not in dsl-ui's list: RegisteredComponents.test.ts pins their keys.
		const errors = findUnknownKeys(parseView(file).document, knownKeys, {
			skipType: type => type.startsWith('flow:'),
		}).filter(d => d.severity === 'error');
		expect(errors, `${file}: ${errors.map(d => `${d.nodePath} ${d.message}`).join('\n')}`).toEqual([]);
	});
});

interface Diagnostic {
	severity: string;
	nodePath: string;
	message: string;
}

interface UnknownKeysModule {
	findUnknownKeys: (
		document: Record<string, unknown>,
		manifest: Record<string, unknown>,
		options?: { skipType?: (type: string) => boolean }
	) => Diagnostic[];
}

/**
 * The dsl-renderer walker and the dsl-ui key list the dev shell validates the views with. DSL_PACKAGES_DIR points at
 * another node_modules/@wadeck-app (for example app-core's) when the repository still has an older release installed.
 */
async function loadKeyCheck() {
	const override = process.env['DSL_PACKAGES_DIR'];
	const walker =
		override === undefined
			? ((await import('@wadeck-app/dsl-renderer/build/unknownKeys')) as UnknownKeysModule)
			: ((await import(
					pathToFileURL(join(override, 'dsl-renderer/dist/build/unknownKeys.js')).href
				)) as UnknownKeysModule);
	const keysFile =
		override === undefined
			? createRequire(import.meta.url).resolve('@wadeck-app/dsl-ui/known-keys.json')
			: join(override, 'dsl-ui/src/known-keys.json');
	return {
		findUnknownKeys: walker.findUnknownKeys,
		knownKeys: JSON.parse(readFileSync(keysFile, 'utf8')) as Record<string, unknown>,
	};
}
