import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { DEFAULT_HISTORY_LIMIT, FLOW_ACTION_BUTTON_STYLE, FLOW_PAGE_PATHS, FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes, loadDslKeyCheck } from 'flow-core/testing';
import { load } from 'js-yaml';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { registerGraphRoutes } from './GraphRoutes.js';
import backend from './index.js';

const configDirectory = vi.hoisted(() => ({ get: vi.fn<(appName: string) => string>() }));
vi.mock('@wadeck-app/shared-cli/ConfigDir', () => ({ ConfigDir: configDirectory }));

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const viewsDir = join(packageDir, 'src/dsl-views');
const MODULE_API_PREFIX = '/api/modules/flow-chart';
const MODULE_PAGE_PREFIX = '/modules/flow-chart';

interface ManifestPoint {
	kind: string;
	slot: string;
	path?: string;
	view: { type: string; value: string };
}
const manifest = JSON.parse(readFileSync(join(packageDir, 'manifest.json'), 'utf8')) as {
	extensionPoints: ManifestPoint[];
};

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

/** Every string stored under `key` ("href", "to", "navigateTo"...) at any depth. */
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
		for (const { name, spec } of sourcesOf(parseView(file))) {
			const match = /^GET \/api\/modules\/flow-chart(\/[^?\s]*)(\?.*)?$/.exec(spec.url);
			expect(
				match,
				`$sources.${name} of ${file}: '${spec.url}' must be 'GET ${MODULE_API_PREFIX}/<route>' (this module only reads)`
			).not.toBeNull();
			const route = `GET ${match![1]!.replace(/\{(\w+)\}/g, ':$1')}`;
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

describe('every link and row navigation lands on a page', () => {
	const own = manifest.extensionPoints.filter(point => point.kind === 'page').map(point => point.path!);
	const flows = FLOW_PAGE_PATHS;

	function pageMatching(target: string): string | undefined {
		const path = target.split('?')[0]!.replace(/\{\w+\}/g, 'x');
		const candidates = [
			...own.map(page => `${MODULE_PAGE_PREFIX}${page}`),
			...flows.map(page => `/modules/flow${page}`),
		];
		return candidates.find(candidate => new RegExp(`^${candidate.replace(/:\w+/g, '[^/]+')}$`).test(path));
	}

	it.each(viewFiles)('%s', file => {
		const document = parseView(file).document;
		const targets = [
			...collectStrings(document, 'href'),
			...collectStrings(document, 'to'),
			...collectStrings(document, 'navigateTo'),
		];
		// A target read from the row ($ctx.row.chartPath...) is built by the route: GraphRoutes.test.ts pins its value.
		for (const target of targets.filter(target => !target.startsWith('$'))) {
			expect(
				pageMatching(target),
				`${file}: '${target}' matches no page of this module or of the flow module`
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
			// A contributed widget renders on flow's page, so it reads the route params of THAT page.
			if (point.slot.startsWith('flow:')) {
				expect(
					[...used].every(name => name === 'id'),
					`${view.file} reads $route params other than :id`
				).toBe(true);
				continue;
			}
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

/** Every node of `$type` at any depth. */
function collectNodes(node: unknown, type: string, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
	if (Array.isArray(node)) {
		for (const child of node) collectNodes(child, type, found);
	} else if (node !== null && typeof node === 'object') {
		if ((node as Record<string, unknown>)['$type'] === type) found.push(node as Record<string, unknown>);
		for (const child of Object.values(node)) collectNodes(child, type, found);
	}
	return found;
}

interface Variant {
	label?: string;
	hint?: string;
	view: Record<string, unknown>;
}

interface Experiment {
	id: string;
	label?: string;
	initial: string;
	variants: Record<string, Variant>;
}

function experimentsOf(node: unknown): Experiment[] {
	return collectNodes(node, 'AbTest') as unknown as Experiment[];
}

function flowsPage(): Record<string, unknown> {
	return parseView('flows-page.yaml').document;
}

/** The layout experiment is the page's only top-level AbTest; the filters experiment is nested in its table variant. */
function layoutExperiment(): Experiment {
	const layout = experimentsOf(flowsPage()['sections']).find(test => test.id === 'flow-chart-index-design');
	if (layout === undefined) throw new Error('flows-page.yaml declares no AbTest flow-chart-index-design');
	return layout;
}

function filtersExperiment(): Experiment {
	const filters = experimentsOf(layoutExperiment().variants['table']!.view);
	expect(filters, 'the table layout variant nests exactly one experiment: the filters').toHaveLength(1);
	return filters[0]!;
}

const FILTER_VARIANTS = ['bar', 'inline', 'chips'];
const NOT_TABLE_LAYOUTS = ['cards', 'list'];

function only(node: unknown, type: string, where: string): Record<string, unknown> {
	const found = collectNodes(node, type);
	expect(found, `${where}: expected exactly one ${type}`).toHaveLength(1);
	return found[0]!;
}

function itemsOf(node: Record<string, unknown>): Record<string, unknown>[] {
	return node['items'] as Record<string, unknown>[];
}

function typesOf(nodes: Record<string, unknown>[]): unknown[] {
	return nodes.map(node => node['$type']);
}

describe('flows page experiments', () => {
	it('declares the layout experiment with stable ids: renaming one drops the choice stored in browsers', () => {
		const test = layoutExperiment();
		expect(test.initial).toBe('table');
		expect(Object.keys(test.variants)).toEqual(['table', 'cards', 'list', 'health-board']);
	});

	it('declares the filters experiment inside the table layout, first variant bar = initial', () => {
		const test = filtersExperiment();
		expect(test.id).toBe('flow-chart-index-filters');
		expect(test.initial).toBe('bar');
		expect(Object.keys(test.variants)).toEqual(FILTER_VARIANTS);
	});

	it('declares these two experiments and no other (no density dimension: dsl-ui has no row size or padding prop)', () => {
		expect(experimentsOf(flowsPage()).map(test => test.id)).toEqual([
			'flow-chart-index-design',
			'flow-chart-index-filters',
		]);
	});

	it('gives every variant a label and a hint (the dock refuses a variant without them), and every test a label', () => {
		for (const test of [layoutExperiment(), filtersExperiment()]) {
			expect(test.label, test.id).toEqual(expect.any(String));
			for (const [key, variant] of Object.entries(test.variants)) {
				expect(variant.label, `${test.id} ${key}`).toEqual(expect.any(String));
				expect(variant.hint, `${test.id} ${key}`).toEqual(expect.any(String));
			}
		}
	});

	it('sets initial to a declared variant of each test (AbTest refuses a dangling initial)', () => {
		for (const test of [layoutExperiment(), filtersExperiment()]) {
			expect(Object.keys(test.variants), test.id).toContain(test.initial);
		}
	});
});

describe('flows page data', () => {
	it('forwards the page, size, text and health of the URL to the flows source', () => {
		const flows = sourcesOf(parseView('flows-page.yaml')).find(source => source.name === 'flows')!;
		expect(flows.spec.params).toEqual({
			page: '$urlParam.page',
			limit: '$urlParam.size',
			q: '$urlParam.q',
			health: '$urlParam.health',
		});
	});

	it('reads only fields the flows route sends (rows, chips, total, limit, emptyMessage)', async () => {
		const fixture = new FlowConfigFixture();
		try {
			const flowFile = join(fixture.configDir, 'a.yml');
			writeFileSync(flowFile, 'id: a\nname: A\nsteps:\n  - id: s\n    type: script\n    script: echo\n');
			fixture.addExecution({ executionId: 'e1', flowId: 'a', flowFile, status: 'failed' });
			const { routes, ctx } = collectRoutes<ModuleContext>();
			registerGraphRoutes(ctx, FlowQueryService.forConfigDir(fixture.configDir));
			const { body } = await callRoute(routes, 'GET /flows');
			const response = body as Record<string, unknown> & { flows: Record<string, unknown>[] };
			const text = JSON.stringify(flowsPage());

			const references = [...text.matchAll(/\$sources\.flows\.([\w.]+)/g)].map(match => match[1]!);
			expect(references.length, 'the page reads the flows source').toBeGreaterThan(0);
			for (const path of references) {
				let node: unknown = response;
				for (const segment of path.split('.')) {
					// Fields of a row are checked below.
					if (Array.isArray(node)) break;
					expect(node, `$sources.flows.${path}: '${segment}' is read from a non-object`).toBeTypeOf('object');
					expect(Object.keys(node as object), `$sources.flows.${path}`).toContain(segment);
					node = (node as Record<string, unknown>)[segment];
				}
			}
			const rowFields = Object.keys(response.flows[0]!);
			const columnKeys = collectStrings(flowsPage(), 'key');
			const contextFields = [...text.matchAll(/\$ctx\.row\.(\w+)/g)].map(match => match[1]!);
			expect(contextFields.length, 'the row panels link through $ctx.row').toBeGreaterThan(0);
			for (const field of [...columnKeys, ...contextFields]) {
				expect(rowFields, `a view reads the row field '${field}'`).toContain(field);
			}
		} finally {
			fixture.dispose();
		}
	});
});

describe('flows page: the table of every filters variant', () => {
	const tableOf = (key: string) => only(filtersExperiment().variants[key]!.view, 'DataTable', key);

	it.each(FILTER_VARIANTS)('%s: columns carry the shell formats and the empty message comes from the route', key => {
		const table = tableOf(key);
		const columns = table['columns'] as Record<string, unknown>[];
		expect(columns.map(column => column['key'])).toEqual([
			'flowId',
			'health',
			'executionCount',
			'failedCount',
			'lastStartedAt',
		]);
		expect(columns.find(column => column['key'] === 'lastStartedAt')).toMatchObject({ format: 'datetime' });
		expect(columns.find(column => column['key'] === 'health')).toMatchObject({
			badge: { failing: 'danger', running: 'info', healthy: 'success' },
		});
		expect(table['emptyMessage']).toBe('$sources.flows.emptyMessage');
		expect(table['rows']).toBe('$sources.flows.flows');
	});

	it.each(FILTER_VARIANTS)(
		'%s: a row opens the flow chart, and its panel has the two explicit links (Open chart, Latest run chart)',
		key => {
			const table = tableOf(key);
			expect(table['navigateTo']).toBe('/modules/flow-chart/flows/{flowId}');
			const links = collectNodes(table['expansion'], 'ButtonLink');
			expect(links.map(link => [link['label'], link['to']])).toEqual([
				['Open chart', '$ctx.row.chartPath'],
				['Latest run chart', '$ctx.row.lastRunChartPath'],
			]);
			// One style for every chart button next to a flow or an execution: no primary beside a secondary.
			for (const link of links) {
				expect(link, String(link['label'])).toMatchObject(FLOW_ACTION_BUTTON_STYLE);
			}
		}
	);
});

describe('flows page: filters experiment', () => {
	const variants = () => filtersExperiment().variants;

	const SEARCH = { urlParam: 'q', placeholder: 'Flow name', resetUrlParams: ['page'] };
	const HEALTH = {
		urlParam: 'health',
		ariaLabel: 'Health',
		placeholder: 'Any health',
		resetUrlParams: ['page'],
	};
	const BOTTOM_ROW = { justify: 'justify-between', align: 'items-center', gap: 'gap-3' };

	it('bar (initial) is the queue pattern: filter bar, table, bottom row', () => {
		const items = itemsOf(variants()['bar']!.view);
		expect(typesOf(items)).toEqual(['PageHeader', 'HorizontalStack', 'DataTable', 'HorizontalStack']);
		const [, bar, , bottom] = items;
		expect(bar).toMatchObject({ gap: 'gap-3', align: 'items-center' });
		expect(typesOf(itemsOf(bar!))).toEqual(['SearchBar', 'CompactSelect']);
		expect(only(bar, 'SearchBar', 'bar')).toMatchObject(SEARCH);
		expect(only(bar, 'CompactSelect', 'bar')).toMatchObject(HEALTH);
		expect(only(bar, 'CompactSelect', 'bar')['options']).toEqual([
			{ value: 'failing', label: 'Failing' },
			{ value: 'running', label: 'Running' },
			{ value: 'healthy', label: 'Healthy' },
		]);
		expect(bottom).toMatchObject(BOTTOM_ROW);
		expect(typesOf(itemsOf(bottom!))).toEqual(['Pagination', 'PageSizeSelect']);
	});

	it('inline puts the same two controls in the header row of the table, with no filter bar around it', () => {
		const items = itemsOf(variants()['inline']!.view);
		expect(typesOf(items)).toEqual(['PageHeader', 'DataTable', 'HorizontalStack']);
		const toolbar = items[1]!['filtersTop'] as Record<string, unknown>[];
		expect(typesOf(toolbar)).toEqual(['SearchBar', 'CompactSelect']);
		expect(toolbar[0]).toMatchObject(SEARCH);
		expect(toolbar[1]).toMatchObject(HEALTH);
		expect(items[2]).toMatchObject(BOTTOM_ROW);
	});

	it('chips shows the health as four toggle links with counts from the route, and one search box', () => {
		const items = itemsOf(variants()['chips']!.view);
		expect(typesOf(items)).toEqual(['PageHeader', 'HorizontalStack', 'DataTable', 'HorizontalStack']);
		const bar = items[1]!;
		expect(only(bar, 'SearchBar', 'chips')).toMatchObject(SEARCH);
		expect(collectNodes(bar, 'CompactSelect'), 'the chips replace the select').toEqual([]);
		const chips = collectNodes(bar, 'ButtonLink');
		const names = ['any', 'failing', 'running', 'healthy'];
		expect(chips.map(chip => chip['label'])).toEqual(names.map(name => `$sources.flows.chips.${name}.label`));
		expect(chips.map(chip => chip['to'])).toEqual(names.map(name => `$sources.flows.chips.${name}.to`));
		expect(chips.map(chip => chip['variant'])).toEqual(names.map(name => `$sources.flows.chips.${name}.variant`));
		expect(items[3]).toMatchObject(BOTTOM_ROW);
	});

	it.each(FILTER_VARIANTS)(
		'%s: Pagination reads the route total and limit, PageSizeSelect starts at the default',
		key => {
			const view = variants()[key]!.view;
			expect(only(view, 'Pagination', key)).toMatchObject({
				urlParam: 'page',
				total: '$sources.flows.total',
				size: '$sources.flows.limit',
			});
			// PageSizeSelect shows options[0] while ?size= is absent: it must be the backend default page size.
			expect(only(view, 'PageSizeSelect', key)).toMatchObject({
				urlParam: 'size',
				resetUrlParams: ['page'],
				options: [DEFAULT_HISTORY_LIMIT, 50, 100],
			});
		}
	);
});

describe('flows page: the other layouts', () => {
	it('cards and list share the bar pattern above the list and the bottom row below it', () => {
		const { variants } = layoutExperiment();
		const bar = itemsOf(filtersExperiment().variants['bar']!.view);
		for (const key of NOT_TABLE_LAYOUTS) {
			const items = itemsOf(variants[key]!.view);
			expect(typesOf(items), key).toEqual([
				'PageHeader',
				'HorizontalStack',
				'flow-chart:FlowIndexList',
				'HorizontalStack',
			]);
			expect(items[1], key).toEqual(bar[1]);
			expect(items[3], key).toEqual(bar[3]);
			expect(items[2], key).toMatchObject({
				flows: '$sources.flows.flows',
				emptyMessage: '$sources.flows.emptyMessage',
			});
		}
	});

	it('health-board searches by name only (it groups by health already) and has no pagination', () => {
		const view = layoutExperiment().variants['health-board']!.view;
		expect(only(view, 'SearchBar', 'health-board')).toMatchObject({ urlParam: 'q', placeholder: 'Flow name' });
		expect(collectNodes(view, 'CompactSelect')).toEqual([]);
		expect(collectNodes(view, 'Pagination')).toEqual([]);
	});

	it('draws flows with FlowIndexList in cards, list and the board, with a layout it accepts', () => {
		const { variants } = layoutExperiment();
		for (const key of ['cards', 'list', 'health-board']) {
			const lists = collectNodes(variants[key]!.view, 'flow-chart:FlowIndexList');
			expect(lists.length, key).toBeGreaterThan(0);
			for (const list of lists) {
				expect(['cards', 'list'], key).toContain(list['layout']);
				expect(list['flows'], key).toMatch(/^\$sources\.(flows|board)\./);
			}
		}
	});
});

describe('every view holds only keys the installed dsl-ui knows', () => {
	it.each(viewFiles)('%s, in every variant', async file => {
		const { findUnknownKeys, knownKeys } = await loadDslKeyCheck();
		expect(
			knownKeys,
			'the installed dsl-ui predates AbTest (release 2026.10.19-110): update @wadeck-app/dsl-ui, or set DSL_PACKAGES_DIR'
		).toHaveProperty('AbTest');
		// The module's own components (flow-chart:...) are registered by its bundle, not by dsl-ui: their props are checked
		// by their own tests (RegisteredComponents.test.ts), everything else of the view is checked here.
		const errors = findUnknownKeys(parseView(file).document, knownKeys).filter(
			d => d.severity === 'error' && !d.message.startsWith('Unknown component type: flow-chart:')
		);
		expect(errors, `${file}: ${errors.map(d => `${d.nodePath} ${d.message}`).join('\n')}`).toEqual([]);
	});
});
