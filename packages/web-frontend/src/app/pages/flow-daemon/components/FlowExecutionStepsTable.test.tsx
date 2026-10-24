import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildStep } from '../flowDaemonFixtures';
import { FlowExecutionStepsTable } from './FlowExecutionStepsTable';

describe('FlowExecutionStepsTable', () => {
	it('shows the metrics of a step', () => {
		render(
			<FlowExecutionStepsTable
				steps={[
					buildStep({
						stepId: 'compile',
						duration: '45s',
						attempts: 2,
						model: 'sonnet',
						costUsd: 0.1234,
						sourceId: 'local',
						workerId: 'worker-7',
					}),
				]}
			/>
		);

		expect(screen.getByText('compile')).toBeInTheDocument();
		expect(screen.getByText('45s')).toBeInTheDocument();
		expect(screen.getByText('2')).toBeInTheDocument();
		expect(screen.getByText('sonnet')).toBeInTheDocument();
		expect(screen.getByText('$0.1234')).toBeInTheDocument();
		expect(screen.getByText('local / worker-7')).toBeInTheDocument();
	});

	it('shows the error of a failed step as an alert', () => {
		render(
			<FlowExecutionStepsTable
				steps={[buildStep({ stepId: 'deploy', status: 'failed', error: 'exit code 1: no space left' })]}
			/>
		);

		expect(screen.getByRole('alert')).toHaveTextContent('exit code 1: no space left');
	});

	it('shows no alert for a step without error', () => {
		render(<FlowExecutionStepsTable steps={[buildStep()]} />);

		expect(screen.queryByRole('alert')).not.toBeInTheDocument();
	});

	it('lists the relaunches with their feedback', () => {
		render(
			<FlowExecutionStepsTable
				steps={[buildStep({ relaunches: [{ at: 'not-a-date', feedback: 'reviewer asked for tests' }] })]}
			/>
		);

		expect(screen.getByText(/reviewer asked for tests/)).toBeInTheDocument();
	});

	it('flags injected steps', () => {
		render(<FlowExecutionStepsTable steps={[buildStep({ injected: true })]} />);

		expect(screen.getByText('injected')).toBeInTheDocument();
	});

	it('offers no logs button unless a handler is given', () => {
		render(<FlowExecutionStepsTable steps={[buildStep({ stepId: 'compile' })]} />);

		expect(screen.queryByRole('button', { name: /Show logs of step/ })).not.toBeInTheDocument();
	});

	it('opens the logs of the step whose button is clicked', () => {
		const onShowStepLogs = vi.fn();
		render(
			<FlowExecutionStepsTable
				steps={[buildStep({ stepId: 'compile' }), buildStep({ stepId: 'deploy' })]}
				onShowStepLogs={onShowStepLogs}
			/>
		);

		fireEvent.click(screen.getByRole('button', { name: 'Show logs of step deploy' }));

		expect(onShowStepLogs).toHaveBeenCalledWith('deploy');
	});

	it('shows dashes for the optional metrics a step does not have', () => {
		render(<FlowExecutionStepsTable steps={[buildStep()]} />);

		// attempts, model, cost, source/worker and relaunches
		expect(screen.getAllByText('-')).toHaveLength(5);
	});
});
