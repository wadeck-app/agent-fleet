/**
 * Claude Launcher Tests
 */
import * as child_process from 'child_process';
import { setupTest } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeLauncher } from '../processing/ClaudeLauncher';

// Mock child_process
vi.mock('child_process');

describe('ClaudeLauncher', () => {
	let manager: ClaudeLauncher;
	let cleanup: () => void;

	beforeEach(() => {
		cleanup = setupTest();
		manager = new ClaudeLauncher();
	});

	afterEach(() => {
		cleanup();
	});

	describe('findClaudePath', () => {
		it('should find claude path on Windows using where command', () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
			vi.spyOn(child_process, 'execSync').mockReturnValue('C:\\Users\\test\\AppData\\Local\\claude.cmd\n');

			const path = manager.findClaudePath();

			expect(path).toBe('C:\\Users\\test\\AppData\\Local\\claude.cmd');
			expect(child_process.execSync).toHaveBeenCalledWith('where claude', {
				encoding: 'utf8',
			});
		});

		it('should find claude path on Unix using which command', () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			vi.spyOn(child_process, 'execSync').mockReturnValue('/usr/local/bin/claude\n');

			const path = manager.findClaudePath();

			expect(path).toBe('/usr/local/bin/claude');
			expect(child_process.execSync).toHaveBeenCalledWith('which claude', {
				encoding: 'utf8',
			});
		});

		it('should return fallback when claude not found', () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			vi.spyOn(child_process, 'execSync').mockImplementation(() => {
				throw new Error('Command not found');
			});

			const path = manager.findClaudePath();

			expect(path).toBe('claude');
		});

		it('should prefer .cmd files over .bat files on Windows', () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
			vi.spyOn(child_process, 'execSync').mockReturnValue('C:\\path\\claude.bat\nC:\\path\\claude.cmd\n');

			const path = manager.findClaudePath();

			expect(path).toBe('C:\\path\\claude.cmd');
		});
	});

	describe('launchInteractive', () => {
		it('should launch claude in interactive mode', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						setTimeout(() => callback(0), 10);
					}
					return mockProcess;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			const result = await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Hello Claude',
				stepId: 'test-step',
				model: 'sonnet',
			});

			expect(result.exitCode).toBe(0);
			expect(result.response).toBe('');
			expect(child_process.spawn).toHaveBeenCalledWith(
				'/usr/bin/claude',
				['--model', 'sonnet', 'Hello Claude'],
				expect.objectContaining({
					cwd: '/test',
					stdio: 'inherit',
				})
			);
		});

		it('should omit --dangerously-skip-permissions when skipPermissions is false', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						setTimeout(() => callback(0), 10);
					}
					return mockProcess;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Test',
				stepId: 'test',
				skipPermissions: false,
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1];
			expect(calledArgs).not.toContain('--dangerously-skip-permissions');
		});

		it('should call onProcessStarted callback', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						setTimeout(() => callback(0), 10);
					}
					return mockProcess;
				}),
			};

			const onProcessStarted = vi.fn();

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Test',
				stepId: 'test',
				onProcessStarted,
			});

			expect(onProcessStarted).toHaveBeenCalledWith(mockProcess);
		});

		it('should handle process errors', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'error') {
						setTimeout(() => callback(new Error('Process failed')), 10);
					}
					return mockProcess;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await expect(
				manager.launchInteractive({
					workingDir: '/test',
					prompt: 'Test',
					stepId: 'test',
				})
			).rejects.toThrow('Process failed');
		});
	});

	describe('buildCommand flags', () => {
		it('should include --output-format stream-json when streamJson is true', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						setTimeout(() => callback(0), 10);
					}
					return mockProcess;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Test',
				stepId: 'test',
				streamJson: true,
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1];
			expect(calledArgs).toContain('--output-format');
			expect(calledArgs).toContain('stream-json');
		});

		it('should include --verbose when verbose is true', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						setTimeout(() => callback(0), 10);
					}
					return mockProcess;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Test',
				stepId: 'test',
				verbose: true,
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1];
			expect(calledArgs).toContain('--verbose');
		});

		it('should not include streaming flags when not set', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						setTimeout(() => callback(0), 10);
					}
					return mockProcess;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Test',
				stepId: 'test',
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1];
			expect(calledArgs).not.toContain('--output-format');
			expect(calledArgs).not.toContain('stream-json');
			expect(calledArgs).not.toContain('--verbose');
		});
	});

	describe('session continuation (--resume)', () => {
		it('includes --resume <id> before -p when resumeSessionId is set', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') setTimeout(() => callback(0), 10);
					return mockProcess;
				}),
			};
			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Continue the conversation',
				stepId: 'test',
				resumeSessionId: 'sess-abc123',
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1] as string[];
			const resumeIdx = calledArgs.indexOf('--resume');
			expect(resumeIdx).toBeGreaterThan(-1);
			expect(calledArgs[resumeIdx + 1]).toBe('sess-abc123');
			// --resume must appear before -p / prompt
			const promptIdx = calledArgs.indexOf('Continue the conversation');
			expect(resumeIdx).toBeLessThan(promptIdx);
		});

		it('does not include --resume when resumeSessionId is not set', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') setTimeout(() => callback(0), 10);
					return mockProcess;
				}),
			};
			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Normal prompt',
				stepId: 'test',
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1] as string[];
			expect(calledArgs).not.toContain('--resume');
		});
	});

	describe('compact mode (--auto-compact)', () => {
		it('includes --auto-compact when autoCompact is true', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') setTimeout(() => callback(0), 10);
					return mockProcess;
				}),
			};
			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Continue compacted',
				stepId: 'test',
				resumeSessionId: 'sess-xyz',
				autoCompact: true,
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1] as string[];
			expect(calledArgs).toContain('--autocompact');
			expect(calledArgs).toContain('--resume');
		});

		it('does not include --auto-compact when autoCompact is not set', async () => {
			const mockProcess = {
				on: vi.fn((event, callback) => {
					if (event === 'close') setTimeout(() => callback(0), 10);
					return mockProcess;
				}),
			};
			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'No compact',
				stepId: 'test',
				resumeSessionId: 'sess-xyz',
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1] as string[];
			expect(calledArgs).not.toContain('--autocompact');
		});
	});

	describe('hooks (--settings and --include-hook-events)', () => {
		function makeMockProcessSimple() {
			return {
				on: vi.fn((event: string, callback: (code: number) => void) => {
					if (event === 'close') {
						setTimeout(() => callback(0), 10);
					}
					return makeMockProcessSimple();
				}),
			};
		}

		it('adds --settings and --include-hook-events when settingsPath is set', async () => {
			const mockProcess = makeMockProcessSimple();
			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'Test hooks',
				stepId: 'test',
				settingsPath: '/tmp/claude-settings-abc.json',
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1] as string[];
			const settingsIdx = calledArgs.indexOf('--settings');
			expect(settingsIdx).toBeGreaterThan(-1);
			expect(calledArgs[settingsIdx + 1]).toBe('/tmp/claude-settings-abc.json');
			expect(calledArgs).toContain('--include-hook-events');
		});

		it('does not add --settings or --include-hook-events when settingsPath is not set', async () => {
			const mockProcess = makeMockProcessSimple();
			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchInteractive({
				workingDir: '/test',
				prompt: 'No hooks',
				stepId: 'test',
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1] as string[];
			expect(calledArgs).not.toContain('--settings');
			expect(calledArgs).not.toContain('--include-hook-events');
		});

		it('adds --settings and --include-hook-events in background mode when settingsPath is set', async () => {
			const mockStdout = { on: vi.fn(() => mockStdout) };
			const mockStderr = { on: vi.fn(() => mockStderr) };
			const mockStdin = { write: vi.fn(), end: vi.fn() };
			const mockProcessBg = {
				stdout: mockStdout,
				stderr: mockStderr,
				stdin: mockStdin,
				on: vi.fn((event: string, callback: (code: number) => void) => {
					if (event === 'close') setTimeout(() => callback(0), 10);
					return mockProcessBg;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcessBg as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			await manager.launchBackground({
				workingDir: '/test',
				prompt: 'bg hooks',
				stepId: 'test',
				settingsPath: '/tmp/claude-settings-xyz.json',
			});

			const calledArgs = (child_process.spawn as any).mock.calls[0][1] as string[];
			expect(calledArgs).toContain('--settings');
			expect(calledArgs).toContain('--include-hook-events');
		});
	});

	describe('launchBackground', () => {
		it.skip('should launch claude in background mode and capture output', async () => {
			const mockStdout = {
				on: vi.fn((event, callback) => {
					if (event === 'data') {
						setTimeout(() => callback(Buffer.from('Claude response')), 10);
					}
					return mockStdout;
				}),
			};

			const mockStderr = {
				on: vi.fn((event, callback) => {
					return mockStderr;
				}),
			};

			const mockStdin = {
				end: vi.fn(),
			};

			const mockProcess = {
				stdout: mockStdout,
				stderr: mockStderr,
				stdin: mockStdin,
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						setTimeout(() => callback(0), 20);
					}
					return mockProcess;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			const result = await manager.launchBackground({
				workingDir: '/test',
				prompt: 'Hello',
				stepId: 'test-step',
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('Claude response');
			expect(mockStdin.end).toHaveBeenCalled();
		});

		it.skip('should capture stderr output', async () => {
			const mockStdout = {
				on: vi.fn(() => mockStdout),
			};

			const mockStderr = {
				on: vi.fn((event, callback) => {
					if (event === 'data') {
						setTimeout(() => callback(Buffer.from('Error message')), 10);
					}
					return mockStderr;
				}),
			};

			const mockStdin = {
				end: vi.fn(),
			};

			const mockProcess = {
				stdout: mockStdout,
				stderr: mockStderr,
				stdin: mockStdin,
				on: vi.fn((event, callback) => {
					if (event === 'close') {
						setTimeout(() => callback(1), 20);
					}
					return mockProcess;
				}),
			};

			vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess as any);
			vi.spyOn(manager, 'findClaudePath').mockReturnValue('/usr/bin/claude');

			const result = await manager.launchBackground({
				workingDir: '/test',
				prompt: 'Test',
				stepId: 'test',
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain('Error message');
		});
	});
});
