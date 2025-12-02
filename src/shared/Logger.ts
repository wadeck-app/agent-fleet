import { StateManager } from './StateManager.js';

/**
 * Dedicated logger that emits to StateManager for UI display
 * Use this instead of console.log when running with UI
 */
export class Logger {
  private static stateManager = StateManager.getInstance();

  static log(...args: any[]): void {
    // Format the message
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        return JSON.stringify(arg);
      }
      return String(arg);
    }).join(' ');

    // Emit to state manager for UI
    this.stateManager.emitLogMessage(message);
  }

  static info(...args: any[]): void {
    this.log('[INFO]', ...args);
  }

  static error(...args: any[]): void {
    this.log('[ERROR]', ...args);
  }

  static warn(...args: any[]): void {
    this.log('[WARN]', ...args);
  }
}
