/**
 * Claude Process Manager Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeProcessManager } from '../processing/ClaudeProcessManager.js';
import * as child_process from 'child_process';

// Mock child_process
vi.mock('child_process');

describe('ClaudeProcessManager', () => {
  let manager: ClaudeProcessManager;

  beforeEach(() => {
    manager = new ClaudeProcessManager();
    vi.clearAllMocks();
  });

  describe('findClaudePath', () => {
    it('should find claude path on Windows using where command', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      vi.spyOn(child_process, 'execSync').mockReturnValue(
        'C:\\Users\\test\\AppData\\Local\\claude.cmd\n'
      );

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
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      const path = manager.findClaudePath();

      expect(path).toBe('claude');
      expect(console.warn).toHaveBeenCalled();
    });

    it('should prefer .cmd files over .bat files on Windows', () => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
      vi.spyOn(child_process, 'execSync').mockReturnValue(
        'C:\\path\\claude.bat\nC:\\path\\claude.cmd\n'
      );

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
      vi.spyOn(console, 'log').mockImplementation(() => {});

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
        ['--dangerously-skip-permissions', '--model', 'sonnet', 'Hello Claude'],
        expect.objectContaining({
          cwd: '/test',
          stdio: 'inherit',
        })
      );
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
      vi.spyOn(console, 'log').mockImplementation(() => {});

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
      vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(
        manager.launchInteractive({
          workingDir: '/test',
          prompt: 'Test',
          stepId: 'test',
        })
      ).rejects.toThrow('Process failed');
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
      vi.spyOn(console, 'log').mockImplementation(() => {});

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
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

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
