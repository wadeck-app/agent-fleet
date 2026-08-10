import * as fs from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadYaml } from './loadYaml.js';

vi.mock('fs');
const mockedFs = vi.mocked(fs);

describe('loadYaml', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit');
		});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		exitSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	it('returns parsed object for valid YAML', () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('id: my-flow\nname: Test');

		const result = loadYaml('flow.yml');
		expect(result).toEqual({ id: 'my-flow', name: 'Test' });
	});

	it('does not coerce YAML dates (JSON_SCHEMA)', () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('date: 2024-01-01');

		const result = loadYaml('flow.yml') as Record<string, unknown>;
		// With JSON_SCHEMA, dates stay as strings
		expect(typeof result['date']).toBe('string');
	});

	it('exits 1 when file does not exist', () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(false);

		expect(() => loadYaml('missing.yml')).toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'));
	});

	it('exits 1 when file is empty', () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('');

		expect(() => loadYaml('empty.yml')).toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('empty'));
	});

	it('exits 1 on YAML parse error', () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('key: [unclosed');

		expect(() => loadYaml('bad.yml')).toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse YAML'));
	});

	it('exits 1 when YAML top-level value is a scalar (boolean)', () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('false');

		expect(() => loadYaml('scalar.yml')).toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('expected a YAML object'));
	});

	it('exits 1 when YAML top-level value is an array', () => {
		mockedFs.existsSync = vi.fn().mockReturnValue(true);
		mockedFs.readFileSync = vi.fn().mockReturnValue('- item1\n- item2');

		expect(() => loadYaml('array.yml')).toThrow('process.exit');
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('expected a YAML object'));
	});
});
