import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LOG_STREAM_AB_IDS } from '../commons/LogStreamAbIds.js';
import { LOG_STREAM_DEFAULTS, type LogStreamChoices, useLogStreamChoices } from './LogStreamChoices.js';

function Probe() {
	const choices = useLogStreamChoices();
	return <output data-testid="choices">{JSON.stringify(choices)}</output>;
}

function shown(host: (children: ReactNode) => ReactNode): LogStreamChoices {
	render(<>{host(<Probe />)}</>);
	return JSON.parse(screen.getByTestId('choices').textContent!) as LogStreamChoices;
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('useLogStreamChoices', () => {
	it('declares one A/B test per dimension, with the flow-logs- prefix', () => {
		expect(LOG_STREAM_AB_IDS).toEqual({
			identity: 'flow-logs-identity',
			grouping: 'flow-logs-grouping',
			navigation: 'flow-logs-navigation',
			time: 'flow-logs-time',
			density: 'flow-logs-density',
		});
	});

	it('gives the defaults when no experiment host is mounted, even if a choice is stored', () => {
		localStorage.setItem('ab.flow-logs-identity', 'stripe');
		expect(shown(children => children)).toEqual(LOG_STREAM_DEFAULTS);
	});

	it('gives the defaults while experiments are off, even if a choice is stored', () => {
		localStorage.setItem('ab.flow-logs-grouping', 'attempt');
		expect(shown(children => <AbExperiments enabled={false}>{children}</AbExperiments>)).toEqual(
			LOG_STREAM_DEFAULTS
		);
	});

	it('applies the stored choices while experiments are on', () => {
		localStorage.setItem('ab.flow-logs-identity', 'stripe');
		localStorage.setItem('ab.flow-logs-grouping', 'attempt');
		localStorage.setItem('ab.flow-logs-navigation', 'rail');
		localStorage.setItem('ab.flow-logs-time', 'delta');
		localStorage.setItem('ab.flow-logs-density', 'folded');
		expect(shown(children => <AbExperiments enabled>{children}</AbExperiments>)).toEqual({
			identity: 'stripe',
			grouping: 'attempt',
			navigation: 'rail',
			time: 'delta',
			density: 'folded',
		});
	});

	it('shows the five rows in the dock of the host', () => {
		render(
			<AbExperiments enabled>
				<Probe />
			</AbExperiments>
		);
		for (const label of ['Step identity', 'Grouping', 'Navigation', 'Time', 'Density']) {
			expect(screen.getByText(label)).toBeInTheDocument();
		}
	});
});
