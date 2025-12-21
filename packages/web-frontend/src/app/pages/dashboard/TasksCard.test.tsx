import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TasksCard } from './TasksCard';

describe('TasksCard', () => {
	describe('rendering', () => {
		it('should render tasks card', () => {
			render(<TasksCard total={20} active={5} review={3} done={10} blocked={1} failed={1} />);

			expect(screen.getByText('Tasks')).toBeInTheDocument();
			expect(screen.getByText('Total')).toBeInTheDocument();
			expect(screen.getByText('Active')).toBeInTheDocument();
			expect(screen.getByText('Review')).toBeInTheDocument();
			expect(screen.getByText('Done')).toBeInTheDocument();
			expect(screen.getByText('Blocked')).toBeInTheDocument();
			expect(screen.getByText('Failed')).toBeInTheDocument();
		});

		it('should display task counts', () => {
			render(<TasksCard total={20} active={5} review={3} done={10} blocked={1} failed={1} />);

			expect(screen.getByText('20')).toBeInTheDocument();
			expect(screen.getByText('5')).toBeInTheDocument();
			expect(screen.getByText('3')).toBeInTheDocument();
			expect(screen.getByText('10')).toBeInTheDocument();
			// There should be two "1"s - one for blocked, one for failed
			const ones = screen.getAllByText('1');
			expect(ones).toHaveLength(2);
		});
	});

	describe('task counts', () => {
		it('should render zero counts', () => {
			render(<TasksCard total={0} active={0} review={0} done={0} blocked={0} failed={0} />);

			// Get all "0" text nodes (should be 6)
			const zeros = screen.getAllByText('0');
			expect(zeros.length).toBeGreaterThanOrEqual(6);
		});

		it('should render all tasks as done', () => {
			render(<TasksCard total={100} active={0} review={0} done={100} blocked={0} failed={0} />);

			// Should have two "100"s - one for total, one for done
			const hundreds = screen.getAllByText('100');
			expect(hundreds).toHaveLength(2);
		});

		it('should render distributed task counts', () => {
			render(<TasksCard total={50} active={10} review={5} done={30} blocked={3} failed={2} />);

			expect(screen.getByText('50')).toBeInTheDocument();
			expect(screen.getByText('10')).toBeInTheDocument();
			expect(screen.getByText('5')).toBeInTheDocument();
			expect(screen.getByText('30')).toBeInTheDocument();
			expect(screen.getByText('3')).toBeInTheDocument();
			expect(screen.getByText('2')).toBeInTheDocument();
		});
	});

	describe('color coding', () => {
		it('should apply blue color to active tasks', () => {
			render(<TasksCard total={20} active={5} review={0} done={0} blocked={0} failed={0} />);

			const activeElement = screen.getByText('5');
			expect(activeElement.className).toContain('text-blue-600');
		});

		it('should apply purple color to review tasks', () => {
			render(<TasksCard total={20} active={0} review={3} done={0} blocked={0} failed={0} />);

			const reviewElement = screen.getByText('3');
			expect(reviewElement.className).toContain('text-purple-600');
		});

		it('should apply green color to done tasks', () => {
			render(<TasksCard total={20} active={0} review={0} done={10} blocked={0} failed={0} />);

			const doneElement = screen.getByText('10');
			expect(doneElement.className).toContain('text-green-600');
		});

		it('should apply orange color to blocked tasks', () => {
			render(<TasksCard total={20} active={0} review={0} done={0} blocked={1} failed={0} />);

			const blockedElement = screen.getByText('1');
			expect(blockedElement.className).toContain('text-orange-600');
		});

		it('should apply red color to failed tasks', () => {
			render(<TasksCard total={20} active={0} review={0} done={0} blocked={0} failed={1} />);

			const failedElement = screen.getByText('1');
			expect(failedElement.className).toContain('text-red-600');
		});
	});
});
