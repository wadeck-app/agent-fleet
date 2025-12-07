/**
 * LogService - Business logic and data transformation for Logs
 * Contains helper methods for formatting and filtering log data
 */

import { LogEntry } from '@/types/domain';
import { LogRepository, logRepository } from '../repositories/LogRepository';

export class LogService {
  constructor(private repository: LogRepository = logRepository) {}

  /**
   * Get all logs, optionally filtered by worker ID
   */
  async getLogs(workerId?: string): Promise<LogEntry[]> {
    return this.repository.getLogs(workerId);
  }

  /**
   * Subscribe to new log entries
   */
  subscribeToLogs(callback: (log: LogEntry) => void): () => void {
    return this.repository.subscribeToLogs(callback);
  }

  /**
   * Filter logs by search term
   */
  filterLogs(logs: LogEntry[], searchTerm: string): LogEntry[] {
    if (!searchTerm) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter((log) => log.message.toLowerCase().includes(term));
  }

  /**
   * Filter logs by level
   */
  filterLogsByLevel(logs: LogEntry[], level: LogEntry['level']): LogEntry[] {
    return logs.filter((log) => log.level === level);
  }

  /**
   * Get logs for a specific worker
   */
  filterLogsByWorker(logs: LogEntry[], workerId: string): LogEntry[] {
    return logs.filter((log) => log.workerId === workerId);
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as any);
  }

  /**
   * Get log level symbol for terminal display
   */
  getLevelSymbol(level: LogEntry['level']): string {
    const symbols: Record<LogEntry['level'], string> = {
      info: '•',
      warn: '⚠',
      error: '✖',
      debug: '◦',
      success: '✓',
    };
    return symbols[level];
  }

  /**
   * Get log level color
   */
  getLevelColor(level: LogEntry['level']): string {
    const colors: Record<LogEntry['level'], string> = {
      info: 'info',
      warn: 'warning',
      error: 'error',
      debug: 'debug',
      success: 'success',
    };
    return colors[level];
  }

  /**
   * Transform logs to terminal lines format
   */
  transformToTerminalLines(logs: LogEntry[]): Array<{
    id: string;
    timestamp: Date;
    level: LogEntry['level'];
    content: string;
  }> {
    return logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      level: log.level,
      content: log.message,
    }));
  }
}

export const logService = new LogService();
