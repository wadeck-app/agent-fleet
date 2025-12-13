import { StateManager } from './StateManager.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Dedicated logger that emits to StateManager for UI display
 * Use this instead of console.log when running with UI
 */
export class Logger {
  private static stateManager: StateManager | null = null;
  private static logLevel: LogLevel = LogLevel.INFO; // Default: INFO and above

  static initialize(stateManager: StateManager): void {
    this.stateManager = stateManager;
  }

  static setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  static log(...args: any[]): void {
    this.logWithLevel(LogLevel.INFO, ...args);
  }

  static debug(...args: any[]): void {
    this.logWithLevel(LogLevel.DEBUG, ...args);
  }

  static info(...args: any[]): void {
    this.logWithLevel(LogLevel.INFO, '[INFO]', ...args);
  }

  static error(...args: any[]): void {
    this.logWithLevel(LogLevel.ERROR, '[ERROR]', ...args);
  }

  static warn(...args: any[]): void {
    this.logWithLevel(LogLevel.WARN, '[WARN]', ...args);
  }

  private static logWithLevel(level: LogLevel, ...args: any[]): void {
    // Skip if below log level
    if (level < this.logLevel) {
      return;
    }

    // Format the message
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg);
      }
      return String(arg);
    }).join(' ');

    // Emit to state manager for UI (if initialized)
    if (this.stateManager) {
      this.stateManager.emitLogMessage(message);
    }
  }
}
