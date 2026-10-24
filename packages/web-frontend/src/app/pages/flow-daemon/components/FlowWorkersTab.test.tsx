import type { FlowWorkersResponse } from '@shared/api/flow-daemon.contract';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFlowWorkers } from '../hooks/useFlowWorkers';
import { FlowWorkersTab } from './FlowWorkersTab';

vi.mock('../hooks/useFlowWorkers', () => ({
	useFlowWorkers: vi.fn(),
}));

const refresh = vi.fn();

function mockWorkers(data: FlowWorkersResponse | null, error: string | null = null) {
	vi.mocked(useFlowWorkers).mockReturnValue({ data, loading: false, error, refresh });
}

function buildResponse(overrides: Partial<FlowWorkersResponse> = {}): FlowWorkersResponse {
	return {
		workers: [],
		daemon: { running: true, pid: 1234, port: 4100 },
		declaredSources: [],
		...overrides,
	};
}

describe('FlowWorkersTab', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('lists the live workers', () => {
		mockWorkers(
			buildResponse({
				workers: [
					{
						workerId: 'worker-1',
						pid: 42,
						state: 'busy',
						sourceId: 'local',
						labels: ['gpu'],
						attachedProjects: ['/projects/app'],
						hasUserInterface: false,
						ephemeral: true,
					},
				],
			})
		);

		render(<FlowWorkersTab />);

		expect(screen.getByText('worker-1')).toBeInTheDocument();
		expect(screen.getByText('busy')).toBeInTheDocument();
		expect(screen.getByText('gpu')).toBeInTheDocument();
		expect(screen.getByText('ephemeral')).toBeInTheDocument();
		expect(screen.queryByText('Declared worker sources')).not.toBeInTheDocument();
	});

	it('explains why there is no worker and lists the declared sources', () => {
		mockWorkers(
			buildResponse({
				emptyExplanation: 'No worker has connected yet. Start one with: flow worker start',
				declaredSources: [{ sourceId: 'local-source', provider: 'local', labels: ['fast'], maxWorkers: 3 }],
			})
		);

		render(<FlowWorkersTab />);

		expect(screen.getByText('No worker has connected yet. Start one with: flow worker start')).toBeInTheDocument();
		expect(screen.getByText('Declared worker sources')).toBeInTheDocument();
		expect(screen.getByText('local-source')).toBeInTheDocument();
		expect(screen.getByText('3')).toBeInTheDocument();
	});

	it('shows the declared sources error instead of an empty sources table', () => {
		mockWorkers(buildResponse({ declaredSourcesError: 'flow.config.yaml: line 3 is invalid' }));

		render(<FlowWorkersTab />);

		expect(screen.getByRole('alert')).toHaveTextContent('flow.config.yaml: line 3 is invalid');
		expect(screen.queryByText('Declared worker sources')).not.toBeInTheDocument();
	});

	it('says when the daemon is not running', () => {
		mockWorkers(buildResponse({ daemon: { running: false, reason: 'no daemon.lock found' } }));

		render(<FlowWorkersTab />);

		expect(screen.getByText('Daemon not running: no daemon.lock found')).toBeInTheDocument();
	});

	it('shows the backend error with a retry button', () => {
		mockWorkers(null, 'Could not reach the flow daemon on port 4100');

		render(<FlowWorkersTab />);

		expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the flow daemon on port 4100');
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
