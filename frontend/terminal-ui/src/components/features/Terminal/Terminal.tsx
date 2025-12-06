/**
 * Terminal - Feature component
 * Displays log lines in terminal format with search highlighting
 */

import { useEffect, useRef } from 'react';
import styles from './Terminal.module.scss';

interface TerminalLine {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  content: string;
}

interface TerminalProps {
  lines: TerminalLine[];
  autoScroll?: boolean;
  searchTerm?: string;
  formatTimestamp: (date: Date) => string;
  getLevelSymbol: (level: string) => string;
  highlightSearchTerm: (text: string, term: string) => JSX.Element;
}

export function Terminal({
  lines,
  autoScroll = true,
  searchTerm = '',
  formatTimestamp,
  getLevelSymbol,
  highlightSearchTerm
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(autoScroll);

  useEffect(() => {
    shouldScrollRef.current = autoScroll;
  }, [autoScroll]);

  useEffect(() => {
    if (shouldScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  const filteredLines = searchTerm
    ? lines.filter(line => line.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : lines;

  return (
    <div className={styles.terminal} ref={containerRef}>
      <div className={styles.terminalContent}>
        {filteredLines.map((line) => (
          <div key={line.id} className={`${styles.terminalLine} ${styles[`terminalLine${line.level.charAt(0).toUpperCase() + line.level.slice(1)}`]}`}>
            <span className={styles.terminalTimestamp}>{formatTimestamp(line.timestamp)}</span>
            <span className={styles.terminalLevel}>{getLevelSymbol(line.level)}</span>
            <span className={styles.terminalMessage}>
              {highlightSearchTerm(line.content, searchTerm)}
            </span>
          </div>
        ))}
        {filteredLines.length === 0 && searchTerm && (
          <div className={styles.terminalEmpty}>No logs match your search</div>
        )}
        {lines.length === 0 && !searchTerm && (
          <div className={styles.terminalEmpty}>No logs available</div>
        )}
      </div>
    </div>
  );
}
