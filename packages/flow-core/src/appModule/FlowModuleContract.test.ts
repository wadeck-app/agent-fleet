import { describe, expect, it } from 'vitest';

import { FLOW_EXPOSED_SLOTS, FLOW_PAGE_PATHS } from './FlowModuleContract.js';

describe('FLOW_EXPOSED_SLOTS', () => {
	it('exposes the execution detail and executions list action slots', () => {
		expect(Object.keys(FLOW_EXPOSED_SLOTS).sort()).toEqual(['execution-actions', 'executions-actions']);
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
