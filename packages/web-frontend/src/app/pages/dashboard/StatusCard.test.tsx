import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusCard } from './StatusCard';

describe('StatusCard', () => {
	describe('rendering', () => {
		it('should render orchestrator status card', () => {
			render(<StatusCard status="ready" uptime={3600000} version="1.0.0" />);

			expect(screen.getByText('Orchestrator Status')).toBeInTheDocument();
			expect(screen.getByText('Status')).toBeInTheDocument();
			expect(screen.getByText('Uptime')).toBeInTheDocument();
			expect(screen.getByText('Version')).toBeInTheDocument();
		});

		it('should display status badge correctly', () => {
			render(<StatusCard status="ready" uptime={3600000} version="1.0.0" />);

			expect(screen.getByText('ready')).toBeInTheDocument();
		});

		it('should display version', () => {
			render(<StatusCard status="ready" uptime={3600000} version="1.0.0" />);

			expect(screen.getByText('1.0.0')).toBeInTheDocument();
		});
	});

	describe('status variants', () => {
		it('should render ready status', () => {
			render(<StatusCard status="ready" uptime={0} version="1.0.0" />);

			expect(screen.getByText('ready')).toBeInTheDocument();
		});

		it('should render starting status', () => {
			render(<StatusCard status="starting" uptime={0} version="1.0.0" />);

			expect(screen.getByText('starting')).toBeInTheDocument();
		});

		it('should render stopping status', () => {
			render(<StatusCard status="stopping" uptime={0} version="1.0.0" />);

			expect(screen.getByText('stopping')).toBeInTheDocument();
		});
	});

	describe('uptime formatting', () => {
		it('should format uptime with hours and minutes', () => {
			// 1h 30m = 5400000ms
			render(<StatusCard status="ready" uptime={5400000} version="1.0.0" />);

			expect(screen.getByText('1h 30m')).toBeInTheDocument();
		});

		it('should format uptime with only minutes when less than 1 hour', () => {
			// 45m = 2700000ms
			render(<StatusCard status="ready" uptime={2700000} version="1.0.0" />);

			expect(screen.getByText('45m')).toBeInTheDocument();
		});

		it('should format uptime with hours and zero minutes', () => {
			// 2h 0m = 7200000ms
			render(<StatusCard status="ready" uptime={7200000} version="1.0.0" />);

			expect(screen.getByText('2h 0m')).toBeInTheDocument();
		});

		it('should format uptime with hours and minutes', () => {
			// 2h 5m = 7500000ms
			render(<StatusCard status="ready" uptime={7500000} version="1.0.0" />);

			expect(screen.getByText('2h 5m')).toBeInTheDocument();
		});

		it('should format zero uptime', () => {
			render(<StatusCard status="ready" uptime={0} version="1.0.0" />);

			expect(screen.getByText('0m')).toBeInTheDocument();
		});
	});
});
