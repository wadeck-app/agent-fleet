import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkersCard } from './WorkersCard';

describe('WorkersCard', () => {
	describe('rendering', () => {
		it('should render workers card', () => {
			render(<WorkersCard connected={5} idle={3} busy={2} />);

			expect(screen.getByText('Workers')).toBeInTheDocument();
			expect(screen.getByText('Connected')).toBeInTheDocument();
			expect(screen.getByText('Idle')).toBeInTheDocument();
			expect(screen.getByText('Busy')).toBeInTheDocument();
		});

		it('should display worker counts', () => {
			render(<WorkersCard connected={5} idle={3} busy={2} />);

			expect(screen.getByText('5')).toBeInTheDocument();
			expect(screen.getByText('3')).toBeInTheDocument();
			expect(screen.getByText('2')).toBeInTheDocument();
		});
	});

	describe('worker counts', () => {
		it('should render zero counts', () => {
			render(<WorkersCard connected={0} idle={0} busy={0} />);

			// Get all "0" text nodes
			const zeros = screen.getAllByText('0');
			expect(zeros).toHaveLength(3);
		});

		it('should render all idle workers', () => {
			render(<WorkersCard connected={5} idle={5} busy={0} />);

			// There should be two "5"s - one for connected, one for idle
			const fives = screen.getAllByText('5');
			expect(fives).toHaveLength(2);
			expect(screen.getByText('0')).toBeInTheDocument();
		});

		it('should render all busy workers', () => {
			render(<WorkersCard connected={5} idle={0} busy={5} />);

			// There should be two "5"s - one for connected, one for busy
			const fives = screen.getAllByText('5');
			expect(fives).toHaveLength(2);
			expect(screen.getByText('0')).toBeInTheDocument();
		});

		it('should render large numbers', () => {
			render(<WorkersCard connected={100} idle={80} busy={20} />);

			expect(screen.getByText('100')).toBeInTheDocument();
			expect(screen.getByText('80')).toBeInTheDocument();
			expect(screen.getByText('20')).toBeInTheDocument();
		});
	});

	describe('color coding', () => {
		it('should apply green color to idle workers', () => {
			const { container } = render(<WorkersCard connected={5} idle={3} busy={2} />);

			// Find the idle count element
			const idleElement = screen.getByText('3');
			expect(idleElement.className).toContain('text-green-600');
		});

		it('should apply orange color to busy workers', () => {
			const { container } = render(<WorkersCard connected={5} idle={3} busy={2} />);

			// Find the busy count element
			const busyElement = screen.getByText('2');
			expect(busyElement.className).toContain('text-orange-600');
		});
	});
});
