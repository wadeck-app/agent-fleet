import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runValidateCommand } from './ValidateCommand.js';

vi.mock('../validation/FlowValidator.js', () => ({
	validateFlowFile: vi.fn(),
}));

import { validateFlowFile } from '../validation/FlowValidator.js';

const mockValidateFlowFile = vi.mocked(validateFlowFile);

describe('runValidateCommand', () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
			throw new Error(`exit:${code ?? 0}`);
		});
	});

	afterEach(() => {
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('exits 1 with usage message on stderr when no args provided', () => {
		expect(() => runValidateCommand([])).toThrow('exit:1');
		expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: flow validate'));
	});

	it('exits 0 for a valid file', () => {
		mockValidateFlowFile.mockReturnValue({ exit: 0 });
		expect(() => runValidateCommand(['/some/flow.yml'])).toThrow('exit:0');
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('exits 1 when validation returns errors', () => {
		mockValidateFlowFile.mockReturnValue({
			exit: 1,
			errors: [{ type: 'schema', message: 'Missing field', path: 'steps[0].id' }],
		});
		expect(() => runValidateCommand(['/some/flow.yml'])).toThrow('exit:1');
		expect(exitSpy).toHaveBeenCalledWith(1);
		const written = String(stdoutSpy.mock.calls[0]?.[0] ?? '');
		const parsed = JSON.parse(written);
		expect(parsed.valid).toBe(false);
		expect(parsed.errors).toHaveLength(1);
	});

	it('exits 2 when file not found', () => {
		mockValidateFlowFile.mockReturnValue({ exit: 2, message: 'File not found: /some/flow.yml' });
		expect(() => runValidateCommand(['/some/flow.yml'])).toThrow('exit:2');
		expect(exitSpy).toHaveBeenCalledWith(2);
		const written = String(stdoutSpy.mock.calls[0]?.[0] ?? '');
		const parsed = JSON.parse(written);
		expect(parsed.valid).toBe(false);
		expect(parsed.errors[0]).toHaveProperty('type', 'file_not_found');
	});

	it('exits 3 when YAML parse error', () => {
		mockValidateFlowFile.mockReturnValue({
			exit: 3,
			errors: [{ type: 'parse_error', message: 'YAML parse error', path: '' }],
		});
		expect(() => runValidateCommand(['/some/flow.yml'])).toThrow('exit:3');
		expect(exitSpy).toHaveBeenCalledWith(3);
		const written = String(stdoutSpy.mock.calls[0]?.[0] ?? '');
		const parsed = JSON.parse(written);
		expect(parsed.valid).toBe(false);
		expect(parsed.errors[0]).toHaveProperty('type', 'parse_error');
	});
});
