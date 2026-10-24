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

function flowsPage(): Record<string, unknown> {
	return parseView('flows-page.yaml').document;
}

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

/** The page body: the only section is the VerticalStack that holds the whole index. */
function pageStack(): Record<string, unknown> {
	const sections = flowsPage()['sections'] as Record<string, unknown>[];
	expect(sections, 'the flows page has one section').toHaveLength(1);
	return sections[0]!;
}

describe('flows page has no A/B test left', () => {
	it('declares no AbTest: the table with health chips is the plain page', () => {
		expect(collectNodes(flowsPage(), 'AbTest')).toEqual([]);
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

describe('flows page: the table', () => {
	const table = () => only(flowsPage(), 'DataTable', 'flows page');

	it('columns carry the shell formats and the empty message comes from the route', () => {
		const columns = table()['columns'] as Record<string, unknown>[];
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
		expect(table()['emptyMessage']).toBe('$sources.flows.emptyMessage');
		expect(table()['rows']).toBe('$sources.flows.flows');
	});

	it('a row opens the flow chart, and its panel has the two explicit links (Open chart, Latest run chart)', () => {
		expect(table()['navigateTo']).toBe('/modules/flow-chart/flows/{flowId}');
		const links = collectNodes(table()['expansion'], 'ButtonLink');
		expect(links.map(link => [link['label'], link['to']])).toEqual([
			['Open chart', '$ctx.row.chartPath'],
			['Latest run chart', '$ctx.row.lastRunChartPath'],
		]);
		// One style for every chart button next to a flow or an execution: no primary beside a secondary.
		for (const link of links) {
			expect(link, String(link['label'])).toMatchObject(FLOW_ACTION_BUTTON_STYLE);
		}
	});
});

describe('flows page: layout', () => {
	const BOTTOM_ROW = { justify: 'justify-between', align: 'items-center', gap: 'gap-3' };

	it('is the queue pattern: header, filter row (search and health chips), table, bottom row', () => {
		const items = itemsOf(pageStack());
		expect(typesOf(items)).toEqual(['PageHeader', 'HorizontalStack', 'DataTable', 'HorizontalStack']);
		expect(items[3]).toMatchObject(BOTTOM_ROW);
		expect(typesOf(itemsOf(items[3]!))).toEqual(['Pagination', 'PageSizeSelect']);
	});

	it('shows the health as four toggle links with counts from the route, and one search box', () => {
		const bar = itemsOf(pageStack())[1]!;
		expect(only(bar, 'SearchBar', 'filter row')).toMatchObject({
			urlParam: 'q',
			placeholder: 'Flow name',
			resetUrlParams: ['page'],
		});
		expect(collectNodes(bar, 'CompactSelect'), 'the chips replace the select').toEqual([]);
		const chips = collectNodes(bar, 'ButtonLink');
		const names = ['any', 'failing', 'running', 'healthy'];
		expect(chips.map(chip => chip['label'])).toEqual(names.map(name => `$sources.flows.chips.${name}.label`));
		expect(chips.map(chip => chip['to'])).toEqual(names.map(name => `$sources.flows.chips.${name}.to`));
		expect(chips.map(chip => chip['variant'])).toEqual(names.map(name => `$sources.flows.chips.${name}.variant`));
	});

	it('Pagination reads the route total and limit, PageSizeSelect starts at the default', () => {
		const view = flowsPage();
		expect(only(view, 'Pagination', 'flows page')).toMatchObject({
			urlParam: 'page',
			total: '$sources.flows.total',
			size: '$sources.flows.limit',
		});
		// PageSizeSelect shows options[0] while ?size= is absent: it must be the backend default page size.
		expect(only(view, 'PageSizeSelect', 'flows page')).toMatchObject({
			urlParam: 'size',
			resetUrlParams: ['page'],
			options: [DEFAULT_HISTORY_LIMIT, 50, 100],
		});
	});

	it('reads only the flows source (no health-board source left)', () => {
		const names = sourcesOf(parseView('flows-page.yaml')).map(source => source.name);
		expect(names).toEqual(['flows']);
	});
});

describe('every view holds only keys the installed dsl-ui knows', () => {
	it.each(viewFiles)('%s', async file => {
		const { findUnknownKeys, knownKeys } = await loadDslKeyCheck();
		// The module's own components (flow-chart:...) are registered by its bundle, not by dsl-ui: their props are checked
		// by their own tests (RegisteredComponents.test.ts), everything else of the view is checked here.
		const errors = findUnknownKeys(parseView(file).document, knownKeys).filter(
			d => d.severity === 'error' && !d.message.startsWith('Unknown component type: flow-chart:')
		);
		expect(errors, `${file}: ${errors.map(d => `${d.nodePath} ${d.message}`).join('\n')}`).toEqual([]);
	});
});
