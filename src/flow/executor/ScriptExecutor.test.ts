/**
 * Script Executor Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScriptExecutor, ScriptExecutionError } from './ScriptExecutor.js';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process');

describe('ScriptExecutor', () => {
  let executor: ScriptExecutor;
  let mockChild: any;

  beforeEach(() => {
    executor = new ScriptExecutor();
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create a mock child process with EventEmitter functionality
    mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.kill = vi.fn();
    mockChild.killed = false;

    vi.spyOn(child_process, 'spawn').mockReturnValue(mockChild as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('execute', () => {
    it('should execute script successfully with exit code 0', async () => {
      const executePromise = executor.execute({
        script: 'echo "Hello World"',
      });

      // Simulate stdout data
      mockChild.stdout.emit('data', Buffer.from('Hello World\n'));

      // Simulate successful close
      mockChild.emit('close', 0);

      const result = await executePromise;

      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
      expect(result.stdout).toBe('Hello World');
      expect(result.stderr).toBe('');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should execute script with non-zero exit code', async () => {
      const executePromise = executor.execute({
        script: 'exit 1',
      });

      // Simulate stderr data
      mockChild.stderr.emit('data', Buffer.from('Command failed\n'));

      // Simulate failed close
      mockChild.emit('close', 1);

      const result = await executePromise;

      expect(result.exitCode).toBe(1);
      expect(result.success).toBe(false);
      expect(result.stderr).toBe('Command failed');
    });

    it('should capture both stdout and stderr', async () => {
      const executePromise = executor.execute({
        script: 'echo "output" && echo "error" >&2',
      });

      // Simulate stdout and stderr data
      mockChild.stdout.emit('data', Buffer.from('output\n'));
      mockChild.stderr.emit('data', Buffer.from('error\n'));

      // Simulate close
      mockChild.emit('close', 0);

      const result = await executePromise;

      expect(result.stdout).toBe('output');
      expect(result.stderr).toBe('error');
    });

    it('should handle multiple data chunks', async () => {
      const executePromise = executor.execute({
        script: 'echo "multi-line output"',
      });

      // Simulate multiple stdout chunks
      mockChild.stdout.emit('data', Buffer.from('line 1\n'));
      mockChild.stdout.emit('data', Buffer.from('line 2\n'));
      mockChild.stdout.emit('data', Buffer.from('line 3\n'));

      mockChild.emit('close', 0);

      const result = await executePromise;

      expect(result.stdout).toBe('line 1\nline 2\nline 3');
    });

    it('should trim stdout and stderr output', async () => {
      const executePromise = executor.execute({
        script: 'test',
      });

      mockChild.stdout.emit('data', Buffer.from('  output with spaces  \n\n'));
      mockChild.stderr.emit('data', Buffer.from('  error with spaces  \n\n'));

      mockChild.emit('close', 0);

      const result = await executePromise;

      expect(result.stdout).toBe('output with spaces');
      expect(result.stderr).toBe('error with spaces');
    });

    it('should use specified working directory', async () => {
      const executePromise = executor.execute({
        script: 'pwd',
        workingDir: '/custom/path',
      });

      mockChild.emit('close', 0);

      await executePromise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        'pwd',
        [],
        expect.objectContaining({
          cwd: '/custom/path',
        })
      );
    });

    it('should use current working directory by default', async () => {
      const cwd = process.cwd();
      const executePromise = executor.execute({
        script: 'pwd',
      });

      mockChild.emit('close', 0);

      await executePromise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        'pwd',
        [],
        expect.objectContaining({
          cwd,
        })
      );
    });

    it('should merge custom environment variables', async () => {
      const executePromise = executor.execute({
        script: 'env',
        env: {
          CUSTOM_VAR: 'custom-value',
          ANOTHER_VAR: 'another-value',
        },
      });

      mockChild.emit('close', 0);

      await executePromise;

      const spawnCall = (child_process.spawn as any).mock.calls[0];
      const spawnEnv = spawnCall[2].env;

      expect(spawnEnv).toMatchObject({
        CUSTOM_VAR: 'custom-value',
        ANOTHER_VAR: 'another-value',
      });
      // Should also include process.env variables
      expect(spawnEnv).toHaveProperty('PATH');
    });

    it('should use shell by default', async () => {
      const executePromise = executor.execute({
        script: 'echo test',
      });

      mockChild.emit('close', 0);

      await executePromise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        'echo test',
        [],
        expect.objectContaining({
          shell: true,
        })
      );
    });

    it('should allow disabling shell', async () => {
      const executePromise = executor.execute({
        script: 'echo test',
        shell: false,
      });

      mockChild.emit('close', 0);

      await executePromise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        'echo test',
        [],
        expect.objectContaining({
          shell: false,
        })
      );
    });

    it('should allow custom shell', async () => {
      const executePromise = executor.execute({
        script: 'test',
        shell: '/bin/bash',
      });

      mockChild.emit('close', 0);

      await executePromise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        'test',
        [],
        expect.objectContaining({
          shell: '/bin/bash',
        })
      );
    });

    it('should handle script execution error', async () => {
      const executePromise = executor.execute({
        script: 'invalid-command',
      });

      // Simulate process error
      mockChild.emit('error', new Error('Command not found'));

      await expect(executePromise).rejects.toThrow(ScriptExecutionError);
      await expect(executePromise).rejects.toMatchObject({
        message: 'Failed to execute script: Command not found',
        exitCode: -1,
      });
    });

    it('should handle timeout', async () => {
      const executePromise = executor.execute({
        script: 'sleep 10',
        timeout: 1000,
      });

      mockChild.stdout.emit('data', Buffer.from('Started'));

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(1000);

      // Simulate close after kill
      mockChild.emit('close', null);

      await expect(executePromise).rejects.toThrow(ScriptExecutionError);
      await expect(executePromise).rejects.toMatchObject({
        message: 'Script execution timed out after 1000ms',
        exitCode: -1,
        stdout: 'Started',
      });

      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should force kill after 5 seconds if SIGTERM fails', async () => {
      mockChild.killed = false;

      const executePromise = executor.execute({
        script: 'sleep 10',
        timeout: 1000,
      });

      // Trigger timeout
      vi.advanceTimersByTime(1000);

      // Process not killed yet, advance 5 more seconds
      vi.advanceTimersByTime(5000);

      expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');

      // Close the process
      mockChild.emit('close', null);

      await expect(executePromise).rejects.toThrow('timed out');
    });

    it('should not timeout when timeout is 0', async () => {
      const executePromise = executor.execute({
        script: 'echo test',
        timeout: 0,
      });

      mockChild.stdout.emit('data', Buffer.from('test\n'));

      // Advance time significantly
      vi.advanceTimersByTime(10000);

      // Process should still be running, now close it
      mockChild.emit('close', 0);

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(mockChild.kill).not.toHaveBeenCalled();
    });

    it('should clear timeout on successful completion', async () => {
      const executePromise = executor.execute({
        script: 'echo fast',
        timeout: 5000,
      });

      mockChild.stdout.emit('data', Buffer.from('fast\n'));
      mockChild.emit('close', 0);

      const result = await executePromise;

      expect(result.success).toBe(true);

      // Advance past timeout to ensure it doesn't fire
      vi.advanceTimersByTime(6000);

      expect(mockChild.kill).not.toHaveBeenCalled();
    });

    it('should clear timeout on error', async () => {
      const executePromise = executor.execute({
        script: 'invalid',
        timeout: 5000,
      });

      mockChild.emit('error', new Error('Failed'));

      await expect(executePromise).rejects.toThrow();

      // Advance past timeout to ensure it doesn't fire
      vi.advanceTimersByTime(6000);

      // Kill should not be called since error happened first
      expect(mockChild.kill).not.toHaveBeenCalled();
    });

    it('should handle null exit code', async () => {
      const executePromise = executor.execute({
        script: 'test',
      });

      // Simulate close with null code (signal termination)
      mockChild.emit('close', null);

      const result = await executePromise;

      expect(result.exitCode).toBe(-1);
      expect(result.success).toBe(false);
    });

    it('should stream stdout in real-time when enabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const executePromise = executor.execute({
        script: 'echo test',
        streaming: true,
        stepId: 'test-step',
      });

      mockChild.stdout.emit('data', Buffer.from('line 1\nline 2\n'));

      mockChild.emit('close', 0);

      await executePromise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[test-step\] \[\d{2}:\d{2}:\d{2}\.\d{3}\] line 1/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[test-step\] \[\d{2}:\d{2}:\d{2}\.\d{3}\] line 2/)
      );
    });

    it('should stream stderr in real-time when enabled', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const executePromise = executor.execute({
        script: 'test',
        streaming: true,
        stepId: 'test-step',
      });

      mockChild.stderr.emit('data', Buffer.from('error line\n'));

      mockChild.emit('close', 0);

      await executePromise;

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[test-step\] \[\d{2}:\d{2}:\d{2}\.\d{3}\] error line/)
      );
    });

    it('should stream without stepId prefix', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const executePromise = executor.execute({
        script: 'echo test',
        streaming: true,
      });

      mockChild.stdout.emit('data', Buffer.from('output\n'));

      mockChild.emit('close', 0);

      await executePromise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\s+\[\d{2}:\d{2}:\d{2}\.\d{3}\] output$/)
      );
    });

    it('should not stream when streaming is disabled', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const executePromise = executor.execute({
        script: 'echo test',
        streaming: false,
      });

      mockChild.stdout.emit('data', Buffer.from('output\n'));

      mockChild.emit('close', 0);

      await executePromise;

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should skip empty lines when streaming', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const executePromise = executor.execute({
        script: 'test',
        streaming: true,
      });

      mockChild.stdout.emit('data', Buffer.from('line 1\n'));

      mockChild.emit('close', 0);

      await executePromise;

      // Should be called once for 'line 1', but not for the empty string after split
      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('should track execution duration', async () => {
      const startTime = Date.now();

      const executePromise = executor.execute({
        script: 'test',
      });

      // Advance time by 500ms
      vi.advanceTimersByTime(500);

      mockChild.emit('close', 0);

      const result = await executePromise;

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeOrThrow', () => {
    it('should return result on success', async () => {
      const executePromise = executor.executeOrThrow({
        script: 'echo success',
      });

      mockChild.stdout.emit('data', Buffer.from('success\n'));
      mockChild.emit('close', 0);

      const result = await executePromise;

      expect(result.exitCode).toBe(0);
      expect(result.success).toBe(true);
      expect(result.stdout).toBe('success');
    });

    it('should throw ScriptExecutionError on non-zero exit code', async () => {
      const executePromise = executor.executeOrThrow({
        script: 'exit 1',
      });

      mockChild.stderr.emit('data', Buffer.from('failed\n'));
      mockChild.emit('close', 1);

      await expect(executePromise).rejects.toThrow(ScriptExecutionError);
      await expect(executePromise).rejects.toMatchObject({
        message: 'Script failed with exit code 1',
        exitCode: 1,
        stderr: 'failed',
      });
    });

    it('should include stdout and stderr in error', async () => {
      const executePromise = executor.executeOrThrow({
        script: 'test',
      });

      mockChild.stdout.emit('data', Buffer.from('some output\n'));
      mockChild.stderr.emit('data', Buffer.from('some error\n'));
      mockChild.emit('close', 2);

      await expect(executePromise).rejects.toMatchObject({
        exitCode: 2,
        stdout: 'some output',
        stderr: 'some error',
      });
    });

    it('should propagate execution errors', async () => {
      const executePromise = executor.executeOrThrow({
        script: 'invalid',
      });

      mockChild.emit('error', new Error('Execution failed'));

      await expect(executePromise).rejects.toThrow(ScriptExecutionError);
      await expect(executePromise).rejects.toMatchObject({
        message: 'Failed to execute script: Execution failed',
      });
    });

    it('should propagate timeout errors', async () => {
      const executePromise = executor.executeOrThrow({
        script: 'sleep 10',
        timeout: 100,
      });

      vi.advanceTimersByTime(100);
      mockChild.emit('close', null);

      await expect(executePromise).rejects.toThrow('timed out after 100ms');
    });
  });

  describe('run', () => {
    it('should execute script with default options', async () => {
      const runPromise = executor.run('echo test');

      mockChild.stdout.emit('data', Buffer.from('test\n'));
      mockChild.emit('close', 0);

      const result = await runPromise;

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('test');
    });

    it('should accept working directory parameter', async () => {
      const runPromise = executor.run('pwd', '/custom/dir');

      mockChild.emit('close', 0);

      await runPromise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        'pwd',
        [],
        expect.objectContaining({
          cwd: '/custom/dir',
        })
      );
    });

    it('should use current directory when not specified', async () => {
      const cwd = process.cwd();
      const runPromise = executor.run('test');

      mockChild.emit('close', 0);

      await runPromise;

      expect(child_process.spawn).toHaveBeenCalledWith(
        'test',
        [],
        expect.objectContaining({
          cwd,
        })
      );
    });

    it('should return execution result', async () => {
      const runPromise = executor.run('echo result');

      mockChild.stdout.emit('data', Buffer.from('result\n'));
      mockChild.emit('close', 0);

      const result = await runPromise;

      expect(result).toMatchObject({
        exitCode: 0,
        stdout: 'result',
        stderr: '',
        success: true,
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('ScriptExecutionError', () => {
    it('should create error with all properties', () => {
      const error = new ScriptExecutionError(
        'Test error',
        1,
        'output',
        'error output'
      );

      expect(error.message).toBe('Test error');
      expect(error.exitCode).toBe(1);
      expect(error.stdout).toBe('output');
      expect(error.stderr).toBe('error output');
      expect(error.name).toBe('ScriptExecutionError');
    });

    it('should be instanceof Error', () => {
      const error = new ScriptExecutionError('Test', 1, '', '');

      expect(error).toBeInstanceOf(Error);
    });
  });
});
