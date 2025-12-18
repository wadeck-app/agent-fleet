/**
 * Test Helpers
 *
 * Helper functions for common test setup and operations.
 */

import { vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Setup fake timers and return cleanup function
 */
export function setupTimers(): () => void {
  vi.useFakeTimers();
  return () => {
    vi.useRealTimers();
  };
}

/**
 * Setup console mocks and return cleanup function with spies
 */
export function setupConsoleMocks() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

  return {
    log,
    error,
    warn,
    info,
    debug,
    restore: () => {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
      info.mockRestore();
      debug.mockRestore();
    },
  };
}

/**
 * Create a temporary directory for testing
 */
export async function createTempTestDir(prefix: string = 'test-'): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}> {
  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  return {
    path: tempPath,
    cleanup: async () => {
      try {
        await fs.promises.rm(tempPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Wait for a condition to be true with timeout
 */
export async function waitForCondition(
  predicate: () => boolean,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50, message = 'Condition not met' } = options;

  const startTime = Date.now();

  while (!predicate()) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`${message} (timeout after ${timeout}ms)`);
    }
    await sleep(interval);
  }
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stats = await fs.promises.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Read JSON file
 */
export async function readJsonFile<T = any>(filePath: string): Promise<T> {
  const content = await fs.promises.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Write JSON file
 */
export async function writeJsonFile(filePath: string, data: any): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await fs.promises.writeFile(filePath, content, 'utf8');
}

/**
 * Mock environment variables for a test
 */
export function mockEnvVars(vars: Record<string, string>): () => void {
  const originalEnv = { ...process.env };

  Object.entries(vars).forEach(([key, value]) => {
    process.env[key] = value;
  });

  return () => {
    process.env = originalEnv;
  };
}

/**
 * Capture console output during a function execution
 */
export async function captureConsoleOutput<T>(
  fn: () => T | Promise<T>
): Promise<{
  result: T;
  stdout: string[];
  stderr: string[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.map(String).join(' '));
  });

  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    stderr.push(args.map(String).join(' '));
  });

  try {
    const result = await fn();
    return { result, stdout, stderr };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

/**
 * Assert that a function throws with a specific message pattern
 */
export async function assertThrowsAsync(
  fn: () => Promise<any>,
  messagePattern?: string | RegExp
): Promise<Error> {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (error instanceof Error) {
      if (messagePattern) {
        const pattern =
          typeof messagePattern === 'string'
            ? new RegExp(messagePattern)
            : messagePattern;
        if (!pattern.test(error.message)) {
          throw new Error(
            `Expected error message to match ${pattern}, but got: ${error.message}`
          );
        }
      }
      return error;
    }
    throw error;
  }
}

/**
 * Create a spy on a module function
 */
export function spyOnModule<T extends object>(
  module: T,
  method: keyof T,
  implementation?: (...args: any[]) => any
) {
  const original = module[method];
  const spy = vi.fn(implementation);
  (module as any)[method] = spy;

  return {
    spy,
    restore: () => {
      (module as any)[method] = original;
    },
  };
}

/**
 * Wait for all pending promises to resolve
 */
export async function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Run a function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(message || `Timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Create a deferred promise that can be resolved/rejected externally
 */
export function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Retry a function until it succeeds or max attempts reached
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: 'linear' | 'exponential';
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 100, backoff = 'linear' } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const waitTime =
          backoff === 'exponential' ? delay * Math.pow(2, attempt - 1) : delay * attempt;
        await sleep(waitTime);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Create a mock that tracks call history with detailed information
 */
export function createTrackedMock<T extends (...args: any[]) => any = any>() {
  const calls: Array<{
    args: any[];
    timestamp: number;
    result?: any;
    error?: Error;
  }> = [];

  const mock = vi.fn((...args: any[]) => {
    const call = {
      args,
      timestamp: Date.now(),
    };

    try {
      const result = undefined;
      calls.push({ ...call, result });
      return result;
    } catch (error) {
      calls.push({ ...call, error: error as Error });
      throw error;
    }
  }) as any as T;

  return {
    mock,
    calls,
    getCallCount: () => calls.length,
    getLastCall: () => calls[calls.length - 1],
    getCallArgs: (index: number) => calls[index]?.args,
    reset: () => {
      calls.length = 0;
      (mock as any).mockClear();
    },
  };
}

/**
 * Setup common test environment (clear mocks, setup console)
 * Returns cleanup function
 *
 * @example
 * ```typescript
 * describe('MyTest', () => {
 *   let cleanup: () => void;
 *
 *   beforeEach(() => {
 *     cleanup = setupTest();
 *   });
 *
 *   afterEach(() => {
 *     cleanup();
 *   });
 * });
 * ```
 */
export function setupTest(): () => void {
  vi.clearAllMocks();

  const consoleMocks = setupConsoleMocks();

  return () => {
    consoleMocks.restore();
    vi.restoreAllMocks();
  };
}
