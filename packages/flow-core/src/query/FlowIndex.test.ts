import { describe, expect, it } from 'vitest';

import { InvalidQueryError } from '../errors.js';
import type { FlowSummary } from '../history/FlowSummaries.js';
import { filterFlowSummaries, flowHealth, groupByHealth, readFlowIndexFilter } from './FlowIndex.js';

function flow(flowId: string, lastStatus: FlowSummary['lastStatus']): FlowSummary {
	return {
		flowId,
		executionCount: 1,
		failedCount: 0,
		runningCount: 0,
		lastStartedAt: '2026-08-16T10:00:00.000Z',
		lastExecutionId: `${flowId}-run`,
		lastStatus,
	};
}

describe('flowHealth', () => {
	it.each([
		['failed', 'failing'],
		['running', 'running'],
		['queued', 'running'],
		['re-queued', 'running'],
		['completed', 'healthy'],
	] as const)('last run %s is %s', (status, health) => {
		expect(flowHealth(flow('a', status))).toBe(health);
	});
});

describe('filterFlowSummaries', () => {
	const flows = [flow('Deploy_prod', 'failed'), flow('build', 'completed'), flow('deploy_dev', 'running')];

	it('keeps everything without a filter', () => {
		expect(filterFlowSummaries(flows, {})).toEqual(flows);
	});

	it('matches the text anywhere in the flow id, ignoring case', () => {
		expect(filterFlowSummaries(flows, { q: 'DEPLOY' }).map(f => f.flowId)).toEqual(['Deploy_prod', 'deploy_dev']);
	});

	it('filters by health, combined with the text', () => {
		expect(filterFlowSummaries(flows, { health: 'running' }).map(f => f.flowId)).toEqual(['deploy_dev']);
		expect(filterFlowSummaries(flows, { q: 'deploy', health: 'failing' }).map(f => f.flowId)).toEqual([
			'Deploy_prod',
		]);
	});
});

describe('groupByHealth', () => {
	it('orders failing, running, healthy and keeps the order inside a group', () => {
		const grouped = groupByHealth([
			flow('a', 'completed'),
			flow('b', 'failed'),
			flow('c', 'running'),
			flow('d', 'failed'),
		]);
		expect(grouped.map(group => group.health)).toEqual(['failing', 'running', 'healthy']);
		expect(grouped.map(group => group.flows.map(f => f.flowId))).toEqual([['b', 'd'], ['c'], ['a']]);
	});
});

describe('readFlowIndexFilter', () => {
	it('reads q and health; empty means unset', () => {
		expect(readFlowIndexFilter({ q: 'x', health: 'failing' })).toEqual({ q: 'x', health: 'failing' });
		expect(readFlowIndexFilter({ q: '', health: '' })).toEqual({});
	});

	it('refuses an unknown health and lists the accepted ones', () => {
		expect(() => readFlowIndexFilter({ health: 'sick' })).toThrow(InvalidQueryError);
		expect(() => readFlowIndexFilter({ health: 'sick' })).toThrow(/failing, running, healthy/);
	});
});
