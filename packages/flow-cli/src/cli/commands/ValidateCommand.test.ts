import { Command } from 'commander';
import { registerValidateCommand } from './ValidateCommand';
import { validateFlowFile } from '../../validation/FlowFileValidator';

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
        exitMock = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); }) as any;
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
            // process.exit throws — that is expected
        }
    };

    describe('human-readable output (default)', () => {
        it('prints ✓ Flow is valid and exits 0 for a valid flow', () => {
            mockValidateFlowFile.mockReturnValue({ exit: 0 });

            runValidate(['/some/flow.yml']);

            expect(consoleLogMock).toHaveBeenCalledWith('✓ Flow is valid');
            expect(exitMock).toHaveBeenCalledWith(0);
        });

        it('prints error message and exits 1 for an invalid flow', () => {
            mockValidateFlowFile.mockReturnValue({
                exit: 1,
                errors: [{ type: 'schema', message: 'Bad field', path: 'steps[0]' }],
            });

            runValidate(['/some/flow.yml']);

            expect(consoleErrorMock).toHaveBeenCalledWith(expect.stringContaining('✗ Flow has 1 error'));
            expect(exitMock).toHaveBeenCalledWith(1);
        });

        it('prints file-not-found error and exits 1 when file is missing', () => {
            mockValidateFlowFile.mockReturnValue({
                exit: 2,
                message: 'File not found: /foo',
            });

            runValidate(['/foo']);

            expect(consoleErrorMock).toHaveBeenCalledWith('✗ File not found: /foo');
            expect(exitMock).toHaveBeenCalledWith(1);
        });
    });

    describe('--json flag', () => {
        it('writes { valid: true } to stdout and exits 0 for a valid flow', () => {
            mockValidateFlowFile.mockReturnValue({ exit: 0 });

            runValidate(['/some/flow.yml', '--json']);

            expect(exitMock).toHaveBeenCalledWith(0);
            expect(stdoutWriteMock).toHaveBeenCalledWith(
                expect.stringContaining('"valid":true')
            );
        });

        it('writes JSON and exits 1 for an invalid flow', () => {
            mockValidateFlowFile.mockReturnValue({
                exit: 1,
                errors: [{ type: 'schema', message: 'Bad field', path: 'steps[0]' }],
            });

            runValidate(['/some/flow.yml', '--json']);

            expect(stdoutWriteMock).toHaveBeenCalledWith(
                expect.stringContaining('"valid":false')
            );
            expect(exitMock).toHaveBeenCalledWith(1);
        });

        it('writes JSON and exits 2 when file is not found', () => {
            mockValidateFlowFile.mockReturnValue({
                exit: 2,
                message: 'File not found: /foo',
            });

            runValidate(['/foo', '--json']);

            expect(stdoutWriteMock).toHaveBeenCalledWith(
                expect.stringContaining('"valid":false')
            );
            expect(exitMock).toHaveBeenCalledWith(2);
        });
    });
});
