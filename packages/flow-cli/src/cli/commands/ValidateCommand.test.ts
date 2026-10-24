import { Command } from 'commander';

import { validateFlowFile } from '../../validation/FlowFileValidator';
import { registerValidateCommand } from './ValidateCommand';

vi.mock('../../validation/FlowFileValidator', () => ({
	validateFlowFile: vi.fn(),
}));

const mockValidateFlowFile = validateFlowFile as ReturnType<typeof vi.fn>;

describe('ValidateCommand', () => {
	let exitMock: ReturnType<typeof vi.fn>;
	let consoleLogMock: ReturnType<typeof vi.fn>;
	let consoleErrorMock: ReturnType<typeof vi.fn>;
	let stdoutWriteMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		exitMock = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('exit');
		}) as any;
		consoleLogMock = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
		stdoutWriteMock = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const runValidate = (args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerValidateCommand(program);
		try {
			program.parse(['node', 'test', 'validate', ...args]);
		} catch {
			// process.exit throws -- that is expected
		}
	};

	describe('human-readable output (default)', () => {
		it('prints [ok] Flow is valid and exits 0 for a valid flow', () => {
			mockValidateFlowFile.mockReturnValue({ exit: 0, version: '1.2.0', warnings: [] });

			runValidate(['/some/flow.yml']);

			expect(consoleLogMock).toHaveBeenCalledWith('[ok] Flow is valid (version 1.2.0)');
			expect(exitMock).toHaveBeenCalledWith(0);
		});

		it('prints the registry message with the referenced flows and exits 1, without a flow error count', () => {
			mockValidateFlowFile.mockReturnValue({
				exit: 4,
				message: 'f.yml is a flow registry (it has `includes:`), not a single flow definition.',
				flowIds: ['flow-a'],
				includes: ['x.yml'],
			});

			runValidate(['f.yml']);

			const printed = consoleErrorMock.mock.calls.map(c => String(c[0])).join('\n');
			expect(printed).toContain('[fail] f.yml is a flow registry');
			expect(printed).toContain('flow-a');
			expect(printed).toContain('x.yml');
			expect(printed).not.toContain('Flow has');
			expect(exitMock).toHaveBeenCalledWith(1);
		});

		it('prints each version warning and still exits 0', () => {
			mockValidateFlowFile.mockReturnValue({ exit: 0, version: '0.0.0', warnings: ['Flow has no version'] });

			runValidate(['/some/flow.yml']);

			expect(consoleErrorMock).toHaveBeenCalledWith('[warn] Flow has no version');
			expect(exitMock).toHaveBeenCalledWith(0);
		});

		it('prints error message and exits 1 for an invalid flow', () => {
			mockValidateFlowFile.mockReturnValue({
				exit: 1,
				errors: [{ type: 'schema', message: 'Bad field', path: 'steps[0]' }],
			});

			runValidate(['/some/flow.yml']);

			expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringContaining('[fail] Flow has 1 error'));
			// The per-error detail line must still surface message + path
			expect(consoleErrorMock).toHaveBeenCalledWith('  - Bad field [steps[0]]');
			expect(exitMock).toHaveBeenCalledWith(1);
		});

		it('prints file-not-found error and exits 1 when file is missing', () => {
			mockValidateFlowFile.mockReturnValue({
				exit: 2,
				message: 'File not found: /foo',
			});

			runValidate(['/foo']);

			expect(consoleErrorMock).toHaveBeenCalledWith('[fail] File not found: /foo');
			expect(exitMock).toHaveBeenCalledWith(1);
		});
	});

	describe('--json flag', () => {
		it('writes { valid: true, version, warnings } to stdout and exits 0 for a valid flow', () => {
			mockValidateFlowFile.mockReturnValue({ exit: 0, version: '0.0.0', warnings: ['no version'] });

			runValidate(['/some/flow.yml', '--json']);

			expect(exitMock).toHaveBeenCalledWith(0);
			expect(stdoutWriteMock).toHaveBeenCalledWith(
				JSON.stringify({ valid: true, version: '0.0.0', warnings: ['no version'] }) + '\n'
			);
		});

		it('writes JSON and exits 1 for an invalid flow', () => {
			mockValidateFlowFile.mockReturnValue({
				exit: 1,
				errors: [{ type: 'schema', message: 'Bad field', path: 'steps[0]' }],
			});

			runValidate(['/some/flow.yml', '--json']);

			expect(stdoutWriteMock).toHaveBeenCalledWith(expect.stringContaining('"valid":false'));
			expect(exitMock).toHaveBeenCalledWith(1);
		});

		it('writes a structured registry error with the hint, flow ids and includes, and exits 1', () => {
			mockValidateFlowFile.mockReturnValue({
				exit: 4,
				message: 'f.yml is a flow registry (it has `includes:`), not a single flow definition.',
				flowIds: ['a'],
				includes: ['x.yml'],
			});

			runValidate(['f.yml', '--json']);

			const written = JSON.parse(String(stdoutWriteMock.mock.calls[0]![0]));
			expect(written).toEqual({
				valid: false,
				errors: [
					{
						type: 'registry_file',
						message: 'f.yml is a flow registry (it has `includes:`), not a single flow definition.',
						path: '',
						flowIds: ['a'],
						includes: ['x.yml'],
					},
				],
			});
			expect(exitMock).toHaveBeenCalledWith(1);
		});

		it('writes JSON and exits 2 when file is not found', () => {
			mockValidateFlowFile.mockReturnValue({
				exit: 2,
				message: 'File not found: /foo',
			});

			runValidate(['/foo', '--json']);

			expect(stdoutWriteMock).toHaveBeenCalledWith(expect.stringContaining('"valid":false'));
			expect(exitMock).toHaveBeenCalledWith(2);
		});
	});
});
