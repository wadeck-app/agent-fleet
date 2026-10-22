import { describe, expect, it } from 'vitest';

import {
	FLOW_EXECUTION_ROW_CONTEXT_FIELDS,
	FLOW_EXPOSED_SLOTS,
	FLOW_PAGE_PATHS,
	executionLogsPath,
	executionPagePath,
} from './FlowModuleContract.js';

describe('FLOW_EXPOSED_SLOTS', () => {
	it('exposes the execution detail, executions list and per-row action slots', () => {
		expect(Object.keys(FLOW_EXPOSED_SLOTS).sort()).toEqual([
			'execution-actions',
			'execution-row-actions',
			'executions-actions',
		]);
	});

	it('accepts button-like root types only, never a page-sized component', () => {
		for (const [slot, accepts] of Object.entries(FLOW_EXPOSED_SLOTS)) {
			expect(accepts, slot).toEqual(expect.arrayContaining(['ActionBar', 'ButtonLink']));
			expect(accepts, slot).not.toContain('PageContent');
		}
	});
});

describe('FLOW_PAGE_PATHS', () => {
	it('lists each page once, rooted at /', () => {
		expect(new Set(FLOW_PAGE_PATHS).size).toBe(FLOW_PAGE_PATHS.length);
		for (const page of FLOW_PAGE_PATHS) expect(page.startsWith('/')).toBe(true);
	});
});

describe('FLOW_PAGE_PATHS logs page', () => {
	it('lists the logs page of one execution', () => {
		expect(FLOW_PAGE_PATHS).toContain('/executions/:id/logs');
	});
});

describe('page links to one execution', () => {
	it('points at the detail and logs pages under /modules/flow, encoding the id', () => {
		expect(executionPagePath('abc123')).toBe('/modules/flow/executions/abc123');
		expect(executionLogsPath('abc123')).toBe('/modules/flow/executions/abc123/logs');
		expect(executionLogsPath('a b')).toBe('/modules/flow/executions/a%20b/logs');
	});
});

describe('FLOW_EXECUTION_ROW_CONTEXT_FIELDS', () => {
	it('names the row fields a contribution to execution-row-actions can read as $ctx.row.<field>', () => {
		expect(FLOW_EXECUTION_ROW_CONTEXT_FIELDS).toEqual(['executionId', 'flowId']);
	});
});
