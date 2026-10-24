import { describe, expect, it } from 'vitest';

import { RUN_LIST_KEYS, parseRunListRows, readRunListProps, runLink, runStatusVariant } from './RunListProps.js';

const ROW = { executionId: 'abc', flowId: 'build', statusLabel: 'ok', startedAt: '2026-10-24T11:27:48.386Z' };

describe('readRunListProps', () => {
	it('resolves runs, to and emptyMessage against the context', () => {
		const props = readRunListProps(
			{ runs: '$ctx.latest', to: '/modules/flow/executions/{executionId}', emptyMessage: 'No run' },
			{ latest: [ROW] }
		);
		expect(props).toEqual({
			runs: [ROW],
			to: '/modules/flow/executions/{executionId}',
			emptyMessage: 'No run',
			unexpectedKeys: [],
		});
	});

	it('lists the keys outside the contract, sorted, ignoring engine keys', () => {
		const props = readRunListProps({ $type: 'flow:RunList', $if: 'x', runs: [], className: 'a', style: 'b' }, {});
		expect(props.unexpectedKeys).toEqual(['className', 'style']);
	});

	it('declares exactly runs, to and emptyMessage', () => {
		expect([...RUN_LIST_KEYS]).toEqual(['runs', 'to', 'emptyMessage']);
	});
});

describe('parseRunListRows', () => {
	it('returns the rows with their time as a Date', () => {
		const [row] = parseRunListRows([ROW]);
		expect(row).toMatchObject({ executionId: 'abc', flowId: 'build', statusLabel: 'ok' });
		expect(row!.startedAt.toISOString()).toBe('2026-10-24T11:27:48.386Z');
	});

	it('refuses a value that is not a list, saying what it got', () => {
		expect(() => parseRunListRows(undefined)).toThrow(/runs must be a list.*got nothing/);
		expect(() => parseRunListRows({})).toThrow(/runs must be a list/);
	});

	it.each(['executionId', 'flowId', 'statusLabel', 'startedAt'])(
		'refuses a row without %s, naming the row and the field',
		field => {
			const broken: Record<string, unknown> = { ...ROW };
			delete broken[field];
			expect(() => parseRunListRows([ROW, broken])).toThrow(new RegExp(`row 1.*${field}`));
		}
	);

	it('refuses a time that is not a date', () => {
		expect(() => parseRunListRows([{ ...ROW, startedAt: 'yesterday' }])).toThrow(/row 0.*startedAt.*"yesterday"/);
	});
});

describe('runStatusVariant', () => {
	it.each([
		['ok', 'success'],
		['FAILED', 'danger'],
		['running', 'info'],
		['waiting', 'default'],
		['retry', 'warning'],
		['ok, recovered', 'success'],
		['ok, 3 tries', 'success'],
	])('maps %s to %s', (label, variant) => {
		expect(runStatusVariant(label)).toBe(variant);
	});

	it('refuses a status it does not know, listing the known ones', () => {
		expect(() => runStatusVariant('exploded')).toThrow(/"exploded".*ok, FAILED, running, waiting, retry/);
	});
});

describe('runLink', () => {
	it('fills {executionId} and encodes it', () => {
		expect(runLink('/modules/flow/executions/{executionId}', 'a/b')).toBe('/modules/flow/executions/a%2Fb');
	});

	it('refuses a template without the placeholder', () => {
		expect(() => runLink('/modules/flow/executions', 'abc')).toThrow(/\{executionId\}/);
	});
});
