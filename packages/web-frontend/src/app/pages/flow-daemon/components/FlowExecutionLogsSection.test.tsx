import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildExecutionLogs } from '../flowDaemonFixtures';
import { type UseFlowExecutionLogsResult, useFlowExecutionLogs } from '../hooks/useFlowExecutionLogs';
import { FlowExecutionLogsSection } from './FlowExecutionLogsSection';

vi.mock('../hooks/useFlowExecutionLogs', () => ({
	useFlowExecutionLogs: vi.fn(),
}));

const setPage = vi.fn();
const setSearchText = vi.fn();
const refresh = vi.fn();

function mockLogs(overrides: Partial<UseFlowExecutionLogsResult>) {
	vi.mocked(useFlowExecutionLogs).mockReturnValue({
		step: undefined,
		level: undefined,
		searchText: '',
		page: 0,
		limit: 100,
		hasActiveFilter: false,
		setStep: vi.fn(),
		setLevel: vi.fn(),
		setSearchText,
		setPage,
		logs: null,
		loading: false,
		error: null,
		refresh,
		...overrides,
	});
}

const entry = { timestamp: '2026-05-06T10:00:00.000Z', level: 'info', stepId: 'compile', message: 'started' };

describe('FlowExecutionLogsSection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('passes the execution id and the initial step to the hook', () => {
		mockLogs({});

		render(<FlowExecutionLogsSection executionId="e1" initialStep="compile" />);

		expect(useFlowExecutionLogs).toHaveBeenCalledWith('e1', 'compile');
	});

	it('shows the lines and the total', () => {
		mockLogs({ logs: buildExecutionLogs({ entries: [entry], total: 250, stepIds: ['compile'] }) });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByLabelText('Execution daemon logs')).toHaveTextContent(
			'2026-05-06T10:00:00.000Z [INFO] compile: started'
		);
		expect(screen.getByText(/250 matching line\(s\) - page 1 of 3/)).toBeInTheDocument();
	});

	it('pages towards older lines and back, and blocks the ends', () => {
		mockLogs({ page: 1, logs: buildExecutionLogs({ entries: [entry], total: 250 }) });

		render(<FlowExecutionLogsSection executionId="e1" />);
		fireEvent.click(screen.getByRole('button', { name: 'Older' }));
		fireEvent.click(screen.getByRole('button', { name: 'Newer' }));

		expect(setPage).toHaveBeenNthCalledWith(1, 2);
		expect(setPage).toHaveBeenNthCalledWith(2, 0);
	});

	it('disables Newer on the tail and Older on the oldest page', () => {
		mockLogs({ page: 0, logs: buildExecutionLogs({ entries: [entry], total: 50 }) });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByRole('button', { name: 'Newer' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled();
	});

	it('labels the run pseudo step in the step filter', () => {
		mockLogs({
			step: '__execution',
			logs: buildExecutionLogs({ entries: [entry], total: 1, stepIds: ['__execution'] }),
		});

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByLabelText('Step')).toHaveTextContent('Run events (__execution)');
	});

	it('propagates the text typed and the refresh', () => {
		mockLogs({ logs: buildExecutionLogs({ entries: [entry], total: 1 }) });

		render(<FlowExecutionLogsSection executionId="e1" />);
		fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'boom' } });
		fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

		expect(setSearchText).toHaveBeenCalledWith('boom');
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it('shows the recorded output when there is some', () => {
		mockLogs({ logs: buildExecutionLogs({ recordedOutput: 'compile exited with code 2' }) });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByLabelText('Output kept in the execution record')).toHaveTextContent(
			'compile exited with code 2'
		);
	});

	it('hides the recorded output block when there is none', () => {
		mockLogs({ logs: buildExecutionLogs({ entries: [entry], total: 1 }) });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.queryByLabelText('Output kept in the execution record')).not.toBeInTheDocument();
	});

	it('explains that no log file covers the run', () => {
		mockLogs({ logs: buildExecutionLogs({ daysRead: [], logsDir: '/logs' }) });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByRole('status')).toHaveTextContent(
			'No daemon log file covers this run: the daemon writes one file per day under /logs'
		);
	});

	it('explains that the filters match no line', () => {
		mockLogs({ hasActiveFilter: true, level: 'error', logs: buildExecutionLogs({ total: 0 }) });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByRole('status')).toHaveTextContent('No log line matches the filters');
	});

	it('warns about unreadable lines next to the list', () => {
		mockLogs({ logs: buildExecutionLogs({ entries: [entry], total: 1, unreadableLines: 4 }) });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByRole('status')).toHaveTextContent(
			'4 line(s) could not be read (damaged log file): this list may be incomplete.'
		);
		expect(screen.getByLabelText('Execution daemon logs')).toBeInTheDocument();
	});

	it('says so when the log files were read but hold no line for the run', () => {
		mockLogs({ logs: buildExecutionLogs({ daysRead: ['2026-05-06'], total: 0 }) });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByRole('status')).toHaveTextContent('No log line was recorded for this run');
		expect(screen.getByRole('status')).toHaveTextContent('2026-05-06');
	});

	it('shows the backend error', () => {
		mockLogs({ error: 'Flow daemon log directory is not readable' });

		render(<FlowExecutionLogsSection executionId="e1" />);

		expect(screen.getByRole('alert')).toHaveTextContent('Flow daemon log directory is not readable');
	});
});
