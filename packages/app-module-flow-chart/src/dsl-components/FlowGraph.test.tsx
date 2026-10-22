import { MemoryRouter } from 'react-router-dom';

import { render, screen, waitFor } from '@testing-library/react';
import { chartPathOfExecution } from 'flow-core';
import { describe, expect, it, vi } from 'vitest';

import { FlowChartLink } from './FlowChartLink.js';
import { FlowGraph } from './FlowGraph.js';
import entries from './index.js';
import { BUILD_GRAPH } from './testing/GraphFixtures.js';

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status });
}

describe('FlowGraph', () => {
	it('shows a loading state, then the chart', async () => {
		const fetchFunction = vi
			.fn()
			.mockResolvedValue(json(200, { graph: BUILD_GRAPH, flowId: 'f', flowName: 'Flow F', flowFile: '/f.yml' }));
		render(
			<MemoryRouter>
				<FlowGraph target={{ flowId: 'f' }} fetchFunction={fetchFunction} />
			</MemoryRouter>
		);
		expect(screen.getByRole('status')).toHaveTextContent('Loading');
		await waitFor(() => expect(screen.getByRole('heading', { name: 'f' })).toBeInTheDocument());
		expect(fetchFunction).toHaveBeenCalledWith('/api/modules/flow-chart/graph?flowId=f', expect.anything());
	});

	it("shows the API's own message when the chart cannot be built", async () => {
		const fetchFunction = vi
			.fn()
			.mockResolvedValue(json(404, { error: "Execution 'zzz' not found. Run flow history." }));
		render(
			<MemoryRouter>
				<FlowGraph target={{ executionId: 'zzz' }} fetchFunction={fetchFunction} />
			</MemoryRouter>
		);
		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('cannot be shown');
		expect(alert).toHaveTextContent("Execution 'zzz' not found. Run flow history.");
	});
});

describe('FlowChartLink', () => {
	it('links to the chart page of the execution', () => {
		render(
			<MemoryRouter>
				<FlowChartLink executionId="abc 1" />
			</MemoryRouter>
		);
		expect(screen.getByRole('link', { name: 'See flow chart' })).toHaveAttribute(
			'href',
			'/modules/flow-chart/flows/runs/abc%201'
		);
		expect(chartPathOfExecution('abc')).toBe('/modules/flow-chart/flows/runs/abc');
	});

	it('says what is wrong when no id reaches it, instead of rendering nothing', () => {
		render(<FlowChartLink executionId={undefined} />);
		expect(screen.getByRole('alert')).toHaveTextContent('executionId: $route.id');
	});
});

describe('registry entries', () => {
	const byName = (name: string) => entries.find(e => e.name === name)!;
	const renderEntry = (name: string, node: Record<string, unknown>, ctx: Record<string, unknown>) =>
		render(<MemoryRouter>{byName(name).render({ node, registry: {}, ctx })}</MemoryRouter>);

	it('registers FlowGraph and FlowChartLink (app-core prefixes them with flow-chart:)', () => {
		expect(entries.map(e => e.name).sort()).toEqual(['FlowChartLink', 'FlowGraph', 'FlowIndexList']);
	});

	it('FlowChartLink reads executionId from the host page context ($route.id)', () => {
		renderEntry('FlowChartLink', { executionId: '$route.id' }, { $route: { id: 'exec9' } });
		expect(screen.getByRole('link', { name: 'See flow chart' })).toHaveAttribute(
			'href',
			'/modules/flow-chart/flows/runs/exec9'
		);
	});

	it('FlowGraph without any id says what to set', () => {
		renderEntry('FlowGraph', { executionId: '$route.id' }, { $route: {} });
		expect(screen.getByRole('alert')).toHaveTextContent('needs executionId or flowId');
	});

	it('FlowGraph loads the flow chart of $route.flowId', async () => {
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(
				json(200, { graph: BUILD_GRAPH, flowId: 'deploy', flowName: 'Deploy', flowFile: '/d.yml' })
			);
		renderEntry('FlowGraph', { flowId: '$route.flowId' }, { $route: { flowId: 'deploy' } });
		await screen.findByRole('heading', { name: 'deploy' });
		expect(fetchSpy).toHaveBeenCalledWith('/api/modules/flow-chart/graph?flowId=deploy', expect.anything());
	});
});
