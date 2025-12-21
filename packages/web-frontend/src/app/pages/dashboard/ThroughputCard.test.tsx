import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ThroughputCard } from './ThroughputCard';

describe('ThroughputCard', () => {
	it('should render throughput metrics', () => {
		render(<ThroughputCard tasksPerHour={12.5} successRate={92} avgTaskDuration={222000} />);

		expect(screen.getByText('Throughput')).toBeInTheDocument();
		expect(screen.getByText('Tasks/Hour')).toBeInTheDocument();
		expect(screen.getByText('12.5')).toBeInTheDocument();
		expect(screen.getByText('Success Rate')).toBeInTheDocument();
		expect(screen.getByText('92%')).toBeInTheDocument();
		expect(screen.getByText('Avg Duration')).toBeInTheDocument();
		expect(screen.getByText('3m 42s')).toBeInTheDocument();
	});

	it('should format duration correctly for hours', () => {
		render(<ThroughputCard tasksPerHour={5} successRate={95} avgTaskDuration={4500000} />);

		expect(screen.getByText('1h 15m')).toBeInTheDocument();
	});

	it('should format duration correctly for seconds only', () => {
		render(<ThroughputCard tasksPerHour={20} successRate={100} avgTaskDuration={45000} />);

		expect(screen.getByText('45s')).toBeInTheDocument();
	});

	it('should color success rate green when >= 90%', () => {
		render(<ThroughputCard tasksPerHour={10} successRate={95} avgTaskDuration={180000} />);

		const successRateText = screen.getByText('95%');
		expect(successRateText).toHaveClass('text-green-600');
	});

	it('should color success rate orange when >= 70% and < 90%', () => {
		render(<ThroughputCard tasksPerHour={10} successRate={75} avgTaskDuration={180000} />);

		const successRateText = screen.getByText('75%');
		expect(successRateText).toHaveClass('text-orange-600');
	});

	it('should color success rate red when < 70%', () => {
		render(<ThroughputCard tasksPerHour={10} successRate={50} avgTaskDuration={180000} />);

		const successRateText = screen.getByText('50%');
		expect(successRateText).toHaveClass('text-red-600');
	});

	it('should handle zero values', () => {
		render(<ThroughputCard tasksPerHour={0} successRate={0} avgTaskDuration={0} />);

		expect(screen.getByText('0')).toBeInTheDocument();
		expect(screen.getByText('0%')).toBeInTheDocument();
		expect(screen.getByText('0s')).toBeInTheDocument();
	});
});
