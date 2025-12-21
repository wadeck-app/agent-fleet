import { describe, expect, it } from 'vitest';

import { formatDate, formatDateFull, formatDateShort } from './DateFormat';

describe('DateFormat', () => {
	describe('formatDate', () => {
		it('should format ISO date string correctly', () => {
			const result = formatDate('2024-03-15T14:30:45.123Z');
			expect(result.short).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(result.full).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		});

		it('should format Date object correctly', () => {
			const date = new Date('2024-03-15T14:30:45Z');
			const result = formatDate(date);
			expect(result.short).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(result.full).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		});

		it('should pad single-digit months and days with zero', () => {
			const date = new Date('2024-01-05T09:08:07Z');
			const result = formatDate(date);
			expect(result.short).toContain('-01-');
			expect(result.short).toContain('-05');
		});

		it('should pad single-digit hours, minutes, and seconds with zero', () => {
			const date = new Date('2024-01-01T09:08:07Z');
			const result = formatDate(date);
			const timeParts = result.full.split(' ')[1]?.split(':');
			expect(timeParts).toBeDefined();
			if (timeParts) {
				expect(timeParts[0]).toHaveLength(2);
				expect(timeParts[1]).toHaveLength(2);
				expect(timeParts[2]).toHaveLength(2);
			}
		});

		it('should return consistent format for same date', () => {
			const dateStr = '2024-12-25T12:00:00Z';
			const result1 = formatDate(dateStr);
			const result2 = formatDate(new Date(dateStr));
			expect(result1.short).toBe(result2.short);
		});

		it('should handle year transitions correctly', () => {
			const date = new Date('2024-12-31T23:59:59Z');
			const result = formatDate(date);
			expect(result.short).toContain('2024-12-31');
		});

		it('should handle leap year dates correctly', () => {
			const date = new Date('2024-02-29T12:00:00Z');
			const result = formatDate(date);
			expect(result.short).toContain('2024-02-29');
		});
	});

	describe('formatDateShort', () => {
		it('should return only the short format', () => {
			const result = formatDateShort('2024-03-15T14:30:45Z');
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(result).not.toContain(':');
		});

		it('should work with Date object', () => {
			const date = new Date('2024-03-15T14:30:45Z');
			const result = formatDateShort(date);
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});

		it('should match formatDate().short', () => {
			const dateStr = '2024-03-15T14:30:45Z';
			const shortResult = formatDateShort(dateStr);
			const fullResult = formatDate(dateStr);
			expect(shortResult).toBe(fullResult.short);
		});
	});

	describe('formatDateFull', () => {
		it('should return only the full format', () => {
			const result = formatDateFull('2024-03-15T14:30:45Z');
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		});

		it('should work with Date object', () => {
			const date = new Date('2024-03-15T14:30:45Z');
			const result = formatDateFull(date);
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		});

		it('should match formatDate().full', () => {
			const dateStr = '2024-03-15T14:30:45Z';
			const fullResult = formatDateFull(dateStr);
			const completeResult = formatDate(dateStr);
			expect(fullResult).toBe(completeResult.full);
		});

		it('should include time component', () => {
			const result = formatDateFull('2024-03-15T14:30:45Z');
			expect(result).toContain(' ');
			expect(result.split(' ')[1]).toMatch(/^\d{2}:\d{2}:\d{2}$/);
		});
	});

	describe('Edge cases', () => {
		it('should handle midnight correctly', () => {
			const date = new Date('2024-01-01T00:00:00Z');
			const result = formatDate(date);
			const time = result.full.split(' ')[1];
			expect(time).toMatch(/^00:00:00$/);
		});

		it('should handle end of day correctly', () => {
			const date = new Date('2024-01-01T23:59:59Z');
			const result = formatDate(date);
			const time = result.full.split(' ')[1];
			expect(time).toMatch(/^23:59:59$/);
		});
	});
});
