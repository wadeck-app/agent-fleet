import type { FlowLogsResponse } from '@shared/api/flow-daemon.contract';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type UseFlowLogsResult, useFlowLogs } from '../hooks/useFlowLogs';
import { FlowLogsTab } from './FlowLogsTab';

vi.mock('../hooks/useFlowLogs', () => ({
	useFlowLogs: vi.fn(),
	LINES_OPTIONS: [100, 200, 500, 1000],
}));

const setDate = vi.fn();
const refresh = vi.fn();

function mockLogs(overrides: Partial<UseFlowLogsResult>) {
	vi.mocked(useFlowLogs).mockReturnValue({
		date: '2026-05-06',
		lines: 200,
		setDate,
		setLines: vi.fn(),
		logs: null,
		loading: false,
		error: null,
		refresh,
		...overrides,
	});
}

function buildLogs(overrides: Partial<FlowLogsResponse>): FlowLogsResponse {
	return { filePath: '/logs/2026-05-06.log', exists: true, text: '', size: 0, ...overrides };
}

describe('FlowLogsTab', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('shows the log text in a monospace block', () => {
		mockLogs({ logs: buildLogs({ text: '12:00:00.000 [INFO] daemon started', size: 34 }) });

		render(<FlowLogsTab />);

		expect(screen.getByLabelText('Daemon logs')).toHaveTextContent('12:00:00.000 [INFO] daemon started');
	});

	it('tells when the log file of that day does not exist', () => {
		mockLogs({ logs: buildLogs({ exists: false }) });

		render(<FlowLogsTab />);

		expect(screen.getByText(/No log file for this day/)).toBeInTheDocument();
		expect(screen.getByText(/\/logs\/2026-05-06\.log/)).toBeInTheDocument();
		expect(screen.queryByLabelText('Daemon logs')).not.toBeInTheDocument();
	});

	it('says when the log file exists but is empty', () => {
		mockLogs({ logs: buildLogs({ text: '' }) });

		render(<FlowLogsTab />);

		expect(screen.getByLabelText('Daemon logs')).toHaveTextContent('(the log file is empty)');
	});

	it('shows the backend error', () => {
		mockLogs({ error: 'date must be a day in the past or today' });

		render(<FlowLogsTab />);

		expect(screen.getByRole('alert')).toHaveTextContent('date must be a day in the past or today');
	});

	it('propagates the day change and the refresh', () => {
		mockLogs({ logs: buildLogs({ text: 'x' }) });

		render(<FlowLogsTab />);
		fireEvent.change(screen.getByLabelText('Day (UTC)'), { target: { value: '2026-05-01' } });
		fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

		expect(setDate).toHaveBeenCalledWith('2026-05-01');
		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
