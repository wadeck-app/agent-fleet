import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as exportModule from './export';
import { convertToCSV, convertToJSON, downloadFile, exportData, generateFilename } from './export';

describe('Export Utilities', () => {
	describe('convertToCSV', () => {
		it('should convert array of objects to CSV', () => {
			const data = [
				{ id: '1', name: 'Alice', age: 30 },
				{ id: '2', name: 'Bob', age: 25 },
			];

			const csv = convertToCSV(data);

			expect(csv).toBe('id,name,age\n1,Alice,30\n2,Bob,25');
		});

		it('should handle empty array', () => {
			const csv = convertToCSV([]);
			expect(csv).toBe('');
		});

		it('should escape values with commas', () => {
			const data = [{ name: 'Smith, John', city: 'New York' }];

			const csv = convertToCSV(data);

			expect(csv).toBe('name,city\n"Smith, John",New York');
		});

		it('should escape values with quotes', () => {
			const data = [{ name: 'John "Johnny" Doe' }];

			const csv = convertToCSV(data);

			expect(csv).toBe('name\n"John ""Johnny"" Doe"');
		});

		it('should escape values with newlines', () => {
			const data = [{ description: 'Line 1\nLine 2' }];

			const csv = convertToCSV(data);

			expect(csv).toBe('description\n"Line 1\nLine 2"');
		});

		it('should handle null and undefined values', () => {
			const data = [{ a: null, b: undefined, c: 'value' }];

			const csv = convertToCSV(data);

			expect(csv).toBe('a,b,c\n,,value');
		});

		it('should handle objects as values', () => {
			const data = [{ name: 'Alice', metadata: { role: 'admin' } }];

			const csv = convertToCSV(data);

			expect(csv).toContain('name,metadata');
			expect(csv).toContain('Alice');
			// Objects are JSON.stringify'd and then CSV-escaped (quotes doubled)
			expect(csv).toContain('""role"":""admin""');
		});

		it('should respect column order when specified', () => {
			const data = [
				{ id: '1', name: 'Alice', age: 30 },
				{ id: '2', name: 'Bob', age: 25 },
			];

			const csv = convertToCSV(data, ['name', 'age']);

			expect(csv).toBe('name,age\nAlice,30\nBob,25');
			expect(csv).not.toContain('id');
		});

		it('should handle missing properties in rows', () => {
			const data = [
				{ id: '1', name: 'Alice' },
				{ id: '2', age: 25 },
			] as any[];

			const csv = convertToCSV(data, ['id', 'name', 'age']);

			expect(csv).toBe('id,name,age\n1,Alice,\n2,,25');
		});
	});

	describe('convertToJSON', () => {
		it('should convert data to pretty JSON by default', () => {
			const data = { name: 'Alice', age: 30 };

			const json = convertToJSON(data);

			expect(json).toBe('{\n  "name": "Alice",\n  "age": 30\n}');
		});

		it('should convert data to compact JSON when pretty=false', () => {
			const data = { name: 'Alice', age: 30 };

			const json = convertToJSON(data, false);

			expect(json).toBe('{"name":"Alice","age":30}');
		});

		it('should handle arrays', () => {
			const data = [1, 2, 3];

			const json = convertToJSON(data);

			expect(json).toBe('[\n  1,\n  2,\n  3\n]');
		});

		it('should handle nested objects', () => {
			const data = {
				user: {
					name: 'Alice',
					contact: { email: 'alice@example.com' },
				},
			};

			const json = convertToJSON(data);

			expect(json).toContain('"user"');
			expect(json).toContain('"name": "Alice"');
			expect(json).toContain('"email": "alice@example.com"');
		});
	});

	describe('downloadFile', () => {
		let createElementSpy: any;
		let appendChildSpy: any;
		let removeChildSpy: any;
		let createObjectURLSpy: any;
		let revokeObjectURLSpy: any;

		beforeEach(() => {
			// Mock DOM elements and methods
			const mockLink = {
				href: '',
				download: '',
				click: vi.fn(),
			};

			createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
			appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
			removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
			createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
			revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('should create a download link and trigger download', () => {
			const content = 'test content';
			const filename = 'test.txt';
			const mimeType = 'text/plain';

			downloadFile(content, filename, mimeType);

			expect(createElementSpy).toHaveBeenCalledWith('a');
			expect(createObjectURLSpy).toHaveBeenCalled();
			expect(appendChildSpy).toHaveBeenCalled();
			expect(removeChildSpy).toHaveBeenCalled();
			expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
		});

		it('should set correct href and download attributes', () => {
			const content = 'test content';
			const filename = 'test.txt';
			const mimeType = 'text/plain';

			downloadFile(content, filename, mimeType);

			const mockLink = createElementSpy.mock.results[0].value;
			expect(mockLink.href).toBe('blob:mock-url');
			expect(mockLink.download).toBe(filename);
			expect(mockLink.click).toHaveBeenCalled();
		});
	});

	describe('exportData', () => {
		it('should call exportData with CSV format without throwing', () => {
			const data = [
				{ id: '1', name: 'Alice' },
				{ id: '2', name: 'Bob' },
			];

			// Mock downloadFile to prevent actual download in tests
			vi.spyOn(exportModule, 'downloadFile').mockImplementation(() => {});

			expect(() => exportData(data, 'csv', 'users')).not.toThrow();
		});

		it('should call exportData with JSON format without throwing', () => {
			const data = [
				{ id: '1', name: 'Alice' },
				{ id: '2', name: 'Bob' },
			];

			vi.spyOn(exportModule, 'downloadFile').mockImplementation(() => {});

			expect(() => exportData(data, 'json', 'users')).not.toThrow();
		});

		it('should call exportData with columns without throwing', () => {
			const data = [{ id: '1', name: 'Alice', age: 30 }];

			vi.spyOn(exportModule, 'downloadFile').mockImplementation(() => {});

			expect(() => exportData(data, 'csv', 'users', ['name', 'age'])).not.toThrow();
		});
	});

	describe('generateFilename', () => {
		it('should generate filename with timestamp', () => {
			const prefix = 'export';
			const filename = generateFilename(prefix);

			expect(filename).toMatch(/^export_\d{4}-\d{2}-\d{2}_\d{6}$/);
		});

		it('should include correct date format', () => {
			const prefix = 'data';
			const filename = generateFilename(prefix);

			const datePattern = /\d{4}-\d{2}-\d{2}/;
			expect(filename).toMatch(datePattern);
		});

		it('should include correct time format', () => {
			const prefix = 'data';
			const filename = generateFilename(prefix);

			const timePattern = /_\d{6}$/; // HHMMSS
			expect(filename).toMatch(timePattern);
		});
	});
});
