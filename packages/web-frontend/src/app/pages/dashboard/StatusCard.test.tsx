import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusCard } from './StatusCard';

describe('StatusCard', () => {
	it('should render orchestrator status card with all sections', () => {
		render(<StatusCard status="ready" uptime={3600000} version="1.0.0" />);

		expect(screen.getByText('Orchestrator Status')).toBeInTheDocument();
		expect(screen.getByText('Status')).toBeInTheDocument();
		expect(screen.getByText('Uptime')).toBeInTheDocument();
		expect(screen.getByText('Version')).toBeInTheDocument();
	});

	it('should display status badge', () => {
		render(<StatusCard status="ready" uptime={3600000} version="1.0.0" />);

		expect(screen.getByText('ready')).toBeInTheDocument();
	});

	it('should display formatted uptime', () => {
		render(<StatusCard status="ready" uptime={5400000} version="1.0.0" />);

		// Uptime formatting logic is tested in formatUptime.test.ts
		expect(screen.getByText('1h 30m')).toBeInTheDocument();
	});

	it('should display version', () => {
		render(<StatusCard status="ready" uptime={3600000} version="1.0.0" />);

		expect(screen.getByText('1.0.0')).toBeInTheDocument();
	});
});
