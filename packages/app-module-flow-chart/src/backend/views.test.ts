import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { DEFAULT_HISTORY_LIMIT, FLOW_PAGE_PATHS } from 'flow-core';
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
		for (const target of targets) {
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

describe('flows page', () => {
	it('offers the backend default page size first: PageSizeSelect shows options[0] while ?size= is absent', () => {
		const selects = collectNodes(parseView('flows-page.yaml').document, 'PageSizeSelect');
		expect(selects).toHaveLength(1);
		expect((selects[0]!['options'] as number[])[0]).toBe(DEFAULT_HISTORY_LIMIT);
	});

	it('forwards the page and the size of the URL to the flows source, and paginates by its total', () => {
		const view = parseView('flows-page.yaml');
		expect(sourcesOf(view)[0]!.spec.params).toEqual({ page: '$urlParam.page', limit: '$urlParam.size' });
		expect(collectNodes(view.document, 'Pagination')[0]).toMatchObject({
			total: '$sources.flows.total',
			size: '$sources.flows.limit',
		});
	});

	it('has four short columns and sets only key and label on them (the DataTable ignores anything else)', () => {
		const table = collectNodes(parseView('flows-page.yaml').document, 'DataTable')[0]!;
		const columns = table['columns'] as Record<string, unknown>[];
		expect(columns.map(column => column['key'])).toEqual([
			'flowId',
			'executionCount',
			'failedCount',
			'lastStartedLabel',
		]);
		for (const column of columns) {
			expect(Object.keys(column).sort()).toEqual(['key', 'label']);
		}
	});
});
