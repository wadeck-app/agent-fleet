import { describe, expect, it } from 'vitest';

import {
	FLOW_ACTION_BUTTON_STYLE,
	FLOW_ACTION_SLOT_ACCEPTS,
	FLOW_EXECUTION_ROW_CONTEXT_FIELDS,
	FLOW_EXPOSED_SLOTS,
	FLOW_PAGE_PATHS,
	FLOW_REQUIRED_RANGE,
	executionLogsPath,
	executionPagePath,
} from './FlowModuleContract.js';

describe('FLOW_EXPOSED_SLOTS', () => {
	it('exposes the execution detail, executions list and per-row slots, with a links slot before the own Logs button', () => {
		expect(Object.keys(FLOW_EXPOSED_SLOTS).sort()).toEqual([
			'execution-actions',
			'execution-links',
			'execution-row-actions',
			'execution-row-links',
			'executions-actions',
		]);
	});

	it('gives every slot the same accepted roots, the action-slot contract', () => {
		for (const [slot, accepts] of Object.entries(FLOW_EXPOSED_SLOTS)) {
			expect(accepts, slot).toEqual(FLOW_ACTION_SLOT_ACCEPTS);
		}
	});
});

describe('FLOW_ACTION_SLOT_ACCEPTS', () => {
	it('is the single flow-chart component whose style is fixed, never a component with free style props', () => {
		expect([...FLOW_ACTION_SLOT_ACCEPTS]).toEqual(['flow-chart:FlowChartLink']);
		expect(FLOW_ACTION_SLOT_ACCEPTS).not.toContain('ButtonLink');
	});
});

describe('FLOW_REQUIRED_RANGE', () => {
	it('accepts any flow version, prereleases included', () => {
		expect(FLOW_REQUIRED_RANGE).toBe('*');
	});
});

describe('FLOW_ACTION_BUTTON_STYLE', () => {
	it('is the secondary small button, the look of every action next to an execution', () => {
		expect(FLOW_ACTION_BUTTON_STYLE).toEqual({ variant: 'secondary', size: 'sm' });
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
