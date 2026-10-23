import { MemoryRouter } from 'react-router-dom';

import { render, screen } from '@testing-library/react';
import { ButtonLink } from '@wadeck-app/dsl-ui';
import { FLOW_ACTION_BUTTON_STYLE, FLOW_CHART_INDEX_PATH } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { FlowChartLink } from './FlowChartLink.js';
import entries from './index.js';

// The reference look: the contract style on a plain dsl-ui ButtonLink, which is also what the flow module's own buttons are.
function referenceClassName(): string {
	const { unmount } = render(
		<MemoryRouter>
			<ButtonLink to="/x" label="Reference" {...FLOW_ACTION_BUTTON_STYLE} />
		</MemoryRouter>
	);
	const className = screen.getByRole('link', { name: 'Reference' }).className;
	unmount();
	return className;
}

describe('FlowChartLink', () => {
	it('links to the chart page of the execution', () => {
		render(
			<MemoryRouter>
				<FlowChartLink target="execution" executionId="abc 1" unexpectedKeys={[]} />
			</MemoryRouter>
		);
		expect(screen.getByRole('link', { name: 'See flow chart' })).toHaveAttribute(
			'href',
			'/modules/flow-chart/flows/runs/abc%201'
		);
	});

	it('links to the flows index for the index target', () => {
		render(
			<MemoryRouter>
				<FlowChartLink target="index" executionId={undefined} unexpectedKeys={[]} />
			</MemoryRouter>
		);
		expect(screen.getByRole('link', { name: 'Flow charts' })).toHaveAttribute('href', FLOW_CHART_INDEX_PATH);
	});

	it('renders exactly the classes of a ButtonLink with the contract style, whatever the target', () => {
		const expected = referenceClassName();
		for (const [target, name] of [
			['execution', 'See flow chart'],
			['index', 'Flow charts'],
		] as const) {
			const { unmount } = render(
				<MemoryRouter>
					<FlowChartLink target={target} executionId="e1" unexpectedKeys={[]} />
				</MemoryRouter>
			);
			expect(screen.getByRole('link', { name }).className, target).toBe(expected);
			unmount();
		}
	});

	it('says what is wrong when no id reaches the execution target, instead of rendering nothing', () => {
		render(<FlowChartLink target="execution" executionId={undefined} unexpectedKeys={[]} />);
		expect(screen.getByRole('alert')).toHaveTextContent('executionId: $route.id');
	});

	it('refuses a target it does not know, naming the allowed ones', () => {
		render(<FlowChartLink target="elsewhere" executionId="e1" unexpectedKeys={[]} />);
		expect(screen.getByRole('alert')).toHaveTextContent('target: execution');
		expect(screen.getByRole('alert')).toHaveTextContent('target: index');
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('refuses to render when the contribution carries a key outside its contract, naming the key and why', () => {
		render(
			<MemoryRouter>
				<FlowChartLink target="execution" executionId="e1" unexpectedKeys={['className', 'variant']} />
			</MemoryRouter>
		);
		const alert = screen.getByRole('alert');
		expect(alert).toHaveTextContent('className, variant');
		expect(alert).toHaveTextContent('style is fixed');
		expect(screen.queryByRole('link')).toBeNull();
	});
});

describe('FlowChartLink registry entry', () => {
	const entry = entries.find(candidate => candidate.name === 'FlowChartLink')!;
	const renderNode = (node: Record<string, unknown>, ctx: Record<string, unknown> = {}) =>
		render(<MemoryRouter>{entry.render({ node, registry: {}, ctx })}</MemoryRouter>);

	it('declares exactly the keys of its contract', () => {
		expect(entry.knownKeys).toEqual(['target', 'executionId']);
	});

	it('reads executionId from the host page context ($route.id)', () => {
		renderNode(
			{ $type: 'flow-chart:FlowChartLink', target: 'execution', executionId: '$route.id' },
			{ $route: { id: 'exec9' } }
		);
		expect(screen.getByRole('link', { name: 'See flow chart' })).toHaveAttribute(
			'href',
			'/modules/flow-chart/flows/runs/exec9'
		);
	});

	it.each(['className', 'style', 'variant', 'size', 'label'])(
		'refuses a contribution that passes %s: the style comes only from the contract',
		key => {
			renderNode({ $type: 'flow-chart:FlowChartLink', target: 'index', [key]: 'x' });
			expect(screen.getByRole('alert')).toHaveTextContent(key);
			expect(screen.queryByRole('link')).toBeNull();
		}
	);
});
