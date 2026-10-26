import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildIncompleteCostStep, buildStep, buildTwoAttemptStep } from '../flowDaemonFixtures';
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

	it('shows the step total label of a retried step', () => {
		render(<FlowExecutionStepsTable steps={[buildTwoAttemptStep()]} />);

		expect(screen.getByText('$0.0075')).toBeInTheDocument();
	});

	it('shows the lower-bound marker of an incomplete total', () => {
		render(<FlowExecutionStepsTable steps={[buildIncompleteCostStep()]} />);

		const label = screen.getByText('$2.7900+ (2 attempts unknown)');
		expect(label).toBeInTheDocument();
		expect(label.textContent).toContain('+');
	});

	it('shows unknown as text, never as $0', () => {
		render(
			<FlowExecutionStepsTable steps={[buildStep({ costUsd: 0, costComplete: false, costLabel: 'unknown' })]} />
		);

		expect(screen.getByText('unknown')).toBeInTheDocument();
		expect(screen.queryByText(/\$0/)).not.toBeInTheDocument();
	});

	it('lists the attempts of a retried step with their cost share', () => {
		render(<FlowExecutionStepsTable steps={[buildTwoAttemptStep()]} />);

		expect(screen.getByText('2 attempts')).toBeInTheDocument();
		expect(screen.getByText('#1 | initial | 12s | $0.0064 | error | 3 turns | 4 tool calls')).toBeInTheDocument();
		expect(screen.getByText('#2 | retry | 5s | $0.0011 | completed | 1 turns | 2 tool calls')).toBeInTheDocument();
	});

	it('shows an unknown attempt cost with its reason, never as $0', () => {
		render(<FlowExecutionStepsTable steps={[buildIncompleteCostStep()]} />);

		expect(
			screen.getByText('#1 | initial | 1m 0s | cost unknown (process crashed before reporting its cost) | crash')
		).toBeInTheDocument();
	});

	it('prints no cost for an attempt of a non-model step', () => {
		const attempt = {
			n: 1,
			origin: 'initial',
			outcome: 'completed',
			endReason: 'completed',
			duration: '1s',
			durationMs: 1000,
		};
		render(
			<FlowExecutionStepsTable
				steps={[
					buildStep({
						stepId: 'check',
						attempts: 2,
						attemptHistory: [
							{ ...attempt, costNotApplicable: true },
							{ ...attempt, n: 2, costNotApplicable: true },
						],
					}),
				]}
			/>
		);

		expect(screen.getByText('#1 | initial | 1s | completed')).toBeInTheDocument();
		expect(screen.queryByText(/cost unknown/)).not.toBeInTheDocument();
	});

	it('offers no attempt list for a single attempt', () => {
		render(
			<FlowExecutionStepsTable
				steps={[buildTwoAttemptStep({ attemptHistory: buildTwoAttemptStep().attemptHistory?.slice(0, 1) })]}
			/>
		);

		expect(screen.queryByText(/ attempts$/)).not.toBeInTheDocument();
	});

	it('keeps the numeric cost for a payload from an older daemon without label nor history', () => {
		render(<FlowExecutionStepsTable steps={[buildStep({ costUsd: 0.1234 })]} />);

		expect(screen.getByText('$0.1234')).toBeInTheDocument();
		expect(screen.queryByText(/ attempts$/)).not.toBeInTheDocument();
	});

	it('shows dashes for the optional metrics a step does not have', () => {
		render(<FlowExecutionStepsTable steps={[buildStep()]} />);

		// attempts, model, cost, source/worker and relaunches
		expect(screen.getAllByText('-')).toHaveLength(5);
	});
});
