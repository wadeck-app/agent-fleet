import { useEffect, useRef } from 'react';
import './Terminal.css';

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
}

export function Terminal({ lines, autoScroll = true, searchTerm = '' }: TerminalProps) {
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

  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const getLevelSymbol = (level: TerminalLine['level']): string => {
    switch (level) {
      case 'info': return '•';
      case 'warn': return '⚠';
      case 'error': return '✖';
      case 'debug': return '◦';
      case 'success': return '✓';
      default: return '•';
    }
  };

  const highlightSearchTerm = (text: string, term: string): JSX.Element => {
    if (!term) return <>{text}</>;

    const parts = text.split(new RegExp(`(${term})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === term.toLowerCase() ? (
            <mark key={i} className="terminal-highlight">{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  const filteredLines = searchTerm
    ? lines.filter(line => line.content.toLowerCase().includes(searchTerm.toLowerCase()))
    : lines;

  return (
    <div className="terminal" ref={containerRef}>
      <div className="terminal-content">
        {filteredLines.map((line) => (
          <div key={line.id} className={`terminal-line terminal-line-${line.level}`}>
            <span className="terminal-timestamp">{formatTimestamp(line.timestamp)}</span>
            <span className="terminal-level">{getLevelSymbol(line.level)}</span>
            <span className="terminal-message">
              {highlightSearchTerm(line.content, searchTerm)}
            </span>
          </div>
        ))}
        {filteredLines.length === 0 && searchTerm && (
          <div className="terminal-empty">No logs match your search</div>
        )}
        {lines.length === 0 && !searchTerm && (
          <div className="terminal-empty">No logs available</div>
        )}
      </div>
    </div>
  );
}
