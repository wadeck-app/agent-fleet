import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { DEFAULT_HISTORY_LIMIT } from 'flow-core';
import { FlowConfigFixture, collectRoutes } from 'flow-core/testing';
import { load } from 'js-yaml';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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

describe('executions page', () => {
	it('offers the backend default page size first: PageSizeSelect shows options[0] while ?size= is absent', () => {
		const selects = collectNodes(parseView('executions-page.yaml').document, 'PageSizeSelect');
		expect(selects, 'executions-page.yaml has no PageSizeSelect').toHaveLength(1);
		expect((selects[0]!['options'] as number[])[0]).toBe(DEFAULT_HISTORY_LIMIT);
	});
});

describe('DataTable columns', () => {
	// dsl-ui normalizeColumn (2026.10.18-101 and the current source) copies only key and label from a YAML column:
	// width, truncate, muted, mono and format are dropped without a warning, so a view that sets them lies.
	it.each(viewFiles)('%s sets only key and label on a column (anything else is ignored by the renderer)', file => {
		const columns = collectNodes(parseView(file).document, 'DataTable').flatMap(
			table => table['columns'] as Record<string, unknown>[]
		);
		for (const column of columns) {
			expect(Object.keys(column).sort(), `${file}: column ${JSON.stringify(column)}`).toEqual(['key', 'label']);
		}
	});
});

describe('executions page layout', () => {
	it('shows the executions table before the flows summary, which asks for a short list', () => {
		const view = parseView('executions-page.yaml');
		const tables = collectNodes(view.document, 'DataTable');
		expect(tables.map(table => table['rows'])).toEqual(['$sources.executions.items', '$sources.flows.flows']);
		const flows = sourcesOf(view).find(source => source.name === 'flows');
		expect(flows?.spec.url).toMatch(/\?limit=\d+$/);
	});

	it('shows the raw status and a one-line error excerpt, columns the executions route sends', () => {
		const table = collectNodes(parseView('executions-page.yaml').document, 'DataTable')[0]!;
		const keys = (table['columns'] as { key: string }[]).map(column => column.key);
		expect(keys).toContain('status');
		expect(keys).toContain('errorExcerpt');
		expect(keys).not.toContain('lastError');
	});
});

describe('execution detail page', () => {
	it('colours the status badge from the variant the route sends and lists display-ready step columns', () => {
		const document = parseView('execution-detail-page.yaml').document;
		const badges = collectNodes(document, 'Badge');
		expect(badges[0]).toMatchObject({
			label: '$sources.execution.status',
			variant: '$sources.execution.statusVariant',
		});
		const steps = collectNodes(document, 'DataTable')[0]!;
		expect((steps['columns'] as { key: string }[]).map(column => column.key)).toEqual([
			'stepId',
			'status',
			'duration',
			'attempts',
			'errorExcerpt',
		]);
	});
});

describe('executions page flow filter', () => {
	it('links each flow row to ?flow=<flowId>, the URL parameter the executions source forwards', () => {
		const view = parseView('executions-page.yaml');
		expect(collectStrings(view.document, 'navigateTo')).toContain('/modules/flow/executions?flow={flowId}');
		const executions = sourcesOf(view).find(source => source.name === 'executions');
		expect(executions?.spec.params?.['flow']).toBe('$urlParam.flow');
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
		for (const target of targets) {
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

describe('extension slots', () => {
	const exposed = Object.keys(manifest.expose?.slots ?? {});

	/** Slot names a view embeds: ExtensionSlot items point at a source that GETs /api/slots/flow:<name>. */
	function embeddedSlots(file: string): string[] {
		const view = parseView(file);
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

	it('embeds execution-actions in the execution detail page', () => {
		expect(embeddedSlots('execution-detail-page.yaml')).toEqual(['execution-actions']);
	});

	it('embeds executions-actions in the executions page', () => {
		expect(embeddedSlots('executions-page.yaml')).toEqual(['executions-actions']);
	});

	it('embeds only slots the manifest exposes, and every exposed slot is embedded somewhere', () => {
		const embedded = viewFiles.flatMap(file => embeddedSlots(file));
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

	it('reads the single precomputed widget route and links to the executions page and the detail page', () => {
		expect(widgetPoint, 'manifest.json declares no dashboard widget').toBeDefined();
		const view = parseView(widgetPoint!.view.value.replace('./src/dsl-views/', ''));
		expect(sourcesOf(view).map(source => source.spec.url)).toEqual([`GET ${MODULE_API_PREFIX}/widgets/executions`]);
		expect(collectStrings(view.document, 'href')).toEqual([`${MODULE_PAGE_PREFIX}/executions`]);
		expect(collectStrings(view.document, 'navigateTo')).toEqual([`${MODULE_PAGE_PREFIX}/executions/{executionId}`]);
	});

	it('shows only columns the widget route sends (a typo would render empty cells)', () => {
		const view = parseView(widgetPoint!.view.value.replace('./src/dsl-views/', ''));
		const columns = collectNodes(view.document, 'DataTable').flatMap(
			table => table['columns'] as { key: string }[]
		);
		expect(columns.map(column => column.key)).toEqual(['title']);
	});
});
