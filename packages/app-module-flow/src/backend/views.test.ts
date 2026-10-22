import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { DEFAULT_HISTORY_LIMIT, statusTag } from 'flow-core';
import { FlowConfigFixture, collectRoutes } from 'flow-core/testing';
import { load } from 'js-yaml';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

/** One document per variant of the file's AbTest (the module declares at most one per view), or the view itself. */
function alternativesOf(file: string): Alternative[] {
	const { document } = parseView(file);
	const abTests = collectNodes(document, 'AbTest');
	if (abTests.length === 0) return [{ variant: undefined, document }];
	if (abTests.length > 1)
		throw new Error(`${file} declares ${abTests.length} AbTest nodes: alternativesOf handles one.`);
	return Object.keys(abTests[0]!['variants'] as object).map(variant => ({
		variant,
		document: resolveVariants(document, () => variant) as Record<string, unknown>,
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
		for (const { variant, document } of alternativesOf('executions-page.yaml')) {
			const selects = collectNodes(document, 'PageSizeSelect');
			expect(selects, `executions-page.yaml (${String(variant)}) has no PageSizeSelect`).toHaveLength(1);
			expect((selects[0]!['options'] as number[])[0]).toBe(DEFAULT_HISTORY_LIMIT);
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

	function columnsOf(file: string): Record<string, unknown>[] {
		return collectNodes(parseView(file).document, 'DataTable').flatMap(
			table => table['columns'] as Record<string, unknown>[]
		);
	}

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

	it('has at most 3 narrow columns of short precomputed text: a 510px content area breaks any longer cell mid-word', () => {
		const table = collectNodes(initialView('executions-page.yaml'), 'DataTable')[0]!;
		expect((table['columns'] as { key: string }[]).map(column => column.key)).toEqual([
			'startedLabel',
			'runLabel',
			'statusLabel',
		]);
	});

	it('keeps When and Status on one line and badges every bare status word the route can send', () => {
		const table = collectNodes(initialView('executions-page.yaml'), 'DataTable')[0]!;
		const columns = table['columns'] as Record<string, unknown>[];
		const byKey = (key: string) => columns.find(column => column['key'] === key)!;
		expect(byKey('startedLabel')).toMatchObject({ nowrap: true });
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

	it('labels the status links from the route, which marks the active filter', () => {
		const links = collectNodes(initialView('executions-page.yaml'), 'Link');
		const labels = links
			.map(link => link['label'])
			.filter(label => typeof label === 'string' && label.startsWith('$'));
		expect(labels).toEqual([
			'$sources.executions.statusFilters.all',
			'$sources.executions.statusFilters.running',
			'$sources.executions.statusFilters.queued',
			'$sources.executions.statusFilters.completed',
			'$sources.executions.statusFilters.failed',
		]);
	});
});

describe('execution detail page', () => {
	it('colours the status badge from the variant the route sends and lists display-ready step columns', () => {
		const document = initialView('execution-detail-page.yaml');
		const badges = collectNodes(document, 'Badge');
		expect(badges[0]).toMatchObject({
			label: '$sources.execution.statusText',
			variant: '$sources.execution.statusVariant',
		});
		const steps = collectNodes(document, 'DataTable')[0]!;
		expect((steps['columns'] as { key: string }[]).map(column => column.key)).toEqual([
			'stepId',
			'statusLabel',
			'duration',
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
		['execution-detail-page.yaml', 'execution-actions'],
		['executions-page.yaml', 'executions-actions'],
	])(
		'%s embeds %s in every A/B variant: choosing a design must not drop the buttons other modules add',
		(file, slot) => {
			for (const { variant, document } of alternativesOf(file)) {
				expect(embeddedSlots(file, document), `variant ${String(variant)}`).toEqual([slot]);
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

	it('reads the single precomputed widget route', () => {
		expect(widgetPoint, 'manifest.json declares no dashboard widget').toBeDefined();
		expect(sourcesOf(parseView(widgetFile)).map(source => source.spec.url)).toEqual([
			`GET ${MODULE_API_PREFIX}/widgets/executions`,
		]);
	});

	it('links every variant to the executions page, and rows to the detail page', () => {
		for (const { variant, document } of alternativesOf(widgetFile)) {
			expect(collectStrings(document, 'href'), String(variant)).toEqual([`${MODULE_PAGE_PREFIX}/executions`]);
			for (const target of collectStrings(document, 'navigateTo')) {
				expect(target, String(variant)).toBe(`${MODULE_PAGE_PREFIX}/executions/{executionId}`);
			}
		}
	});

	// Fields of one row of the widget route: `title` for the list variant, the rest for the dense table.
	const ROW_FIELDS = ['title', 'statusLabel', 'flowId', 'when'];

	it('shows only columns the widget route sends (a typo would render empty cells)', () => {
		for (const { variant, document } of alternativesOf(widgetFile)) {
			const columns = collectNodes(document, 'DataTable').flatMap(table => table['columns'] as { key: string }[]);
			for (const column of columns) expect(ROW_FIELDS, `${String(variant)}: ${column.key}`).toContain(column.key);
		}
	});

	it('shows the current design first: one precomputed title column', () => {
		const columns = collectNodes(initialView(widgetFile), 'DataTable').flatMap(
			table => table['columns'] as { key: string }[]
		);
		expect(columns.map(column => column.key)).toEqual(['title']);
	});

	it('reads only widget fields the route sends', () => {
		const sent = ['total', 'running', 'failed', 'lastRun', 'viewAllLabel', 'items', 'compact'];
		for (const { variant, document } of alternativesOf(widgetFile)) {
			const used = JSON.stringify(document).match(/\$sources\.recent\.\w+/g) ?? [];
			for (const reference of used) {
				expect(sent, `${String(variant)}: ${reference}`).toContain(reference.split('.')[2]);
			}
		}
	});
});

describe('A/B variants (AbTest)', () => {
	// The views declare their design alternatives; the shell's dock picks one. Ids and variant keys are the contract
	// of the README: renaming one drops the choice a user stored in the browser.
	const EXPECTED: Record<string, { id: string; initial: string; variants: string[] }> = {
		'executions-widget.yaml': {
			id: 'flow-widget-design',
			initial: 'list',
			variants: ['list', 'tiles', 'compact'],
		},
		'executions-page.yaml': {
			id: 'flow-executions-design',
			initial: 'table',
			variants: ['table', 'filters-first', 'flows-aside'],
		},
		'execution-detail-page.yaml': {
			id: 'flow-execution-design',
			initial: 'steps-table',
			variants: ['steps-table', 'summary-first'],
		},
	};
	const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

	const tests = viewFiles.flatMap(file =>
		collectNodes(parseView(file).document, 'AbTest').map(test => ({ file, test }))
	);

	it('declares exactly the experiments of the README, one per view', () => {
		const found: Record<string, unknown[]> = {};
		for (const { file, test } of tests) {
			found[file] = [
				...(found[file] ?? []),
				{ id: test['id'], initial: test['initial'], variants: Object.keys(test['variants'] as object) },
			];
		}
		expect(found).toEqual(Object.fromEntries(Object.entries(EXPECTED).map(([file, test]) => [file, [test]])));
	});

	it('has a valid id (letters, digits, _ and -), unique across the module', () => {
		const ids = tests.map(({ test }) => String(test['id']));
		expect(tests.length).toBeGreaterThan(0);
		for (const id of ids) expect(id, `id '${id}'`).toMatch(ID_PATTERN);
		expect(new Set(ids).size, `duplicate id in ${ids.join(', ')}`).toBe(ids.length);
	});

	it.each(tests.map(({ file, test }) => [file, String(test['id']), test] as const))(
		'%s: %s has a label, an initial variant that exists, and variants with a label, a hint and a view',
		(file, id, test) => {
			expect(test['label'], `${file} ${id}`).toEqual(expect.stringMatching(/\S/));
			const variants = test['variants'] as Record<string, Record<string, unknown>>;
			expect(Object.keys(variants).length, `${file} ${id} needs two variants or more`).toBeGreaterThanOrEqual(2);
			expect(Object.keys(variants), `${file} ${id}: initial`).toContain(test['initial']);
			for (const [key, variant] of Object.entries(variants)) {
				expect(Object.keys(variant).sort(), `${file} ${id} variant ${key}`).toEqual(['hint', 'label', 'view']);
				expect(variant['label'], `${id}/${key} label`).toEqual(expect.stringMatching(/\S/));
				expect(variant['hint'], `${id}/${key} hint`).toEqual(expect.stringMatching(/\S/));
				expect(variant['view'], `${id}/${key} view`).toHaveProperty('$type');
			}
		}
	);

	it.each(viewFiles)("%s holds no key the shell's dsl-ui does not know, in any variant", async file => {
		const { findUnknownKeys, knownKeys } = await loadKeyCheck();
		expect(
			knownKeys,
			'the installed dsl-ui predates AbTest (release 2026.10.19-110): update @wadeck-app/dsl-ui, or set DSL_PACKAGES_DIR'
		).toHaveProperty('AbTest');
		const errors = findUnknownKeys(parseView(file).document, knownKeys).filter(d => d.severity === 'error');
		expect(errors, `${file}: ${errors.map(d => `${d.nodePath} ${d.message}`).join('\n')}`).toEqual([]);
	});
});

interface Diagnostic {
	severity: string;
	nodePath: string;
	message: string;
}

interface UnknownKeysModule {
	findUnknownKeys: (document: Record<string, unknown>, manifest: Record<string, unknown>) => Diagnostic[];
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
