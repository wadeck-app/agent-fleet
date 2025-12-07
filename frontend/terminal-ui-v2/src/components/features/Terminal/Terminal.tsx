/**
 * Terminal - Feature component
 * Displays log lines in terminal format with search highlighting
 * Enhanced with Framer Motion animations
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  getLevelSymbol: (level: TerminalLine['level']) => string;
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

  // Animation variants for terminal lines
  const lineVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.02, // Stagger effect
        duration: 0.2,
        ease: 'easeOut',
      },
    }),
    exit: { opacity: 0, x: 20, transition: { duration: 0.15 } },
  };

  const cursorVariants = {
    blink: {
      opacity: [1, 0, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: 'linear',
      },
    },
  };

  return (
    <div className={styles.terminal} ref={containerRef}>
      <div className={styles.terminalContent}>
        <AnimatePresence mode="popLayout">
          {filteredLines.map((line, index) => (
            <motion.div
              key={line.id}
              custom={index}
              variants={lineVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className={`${styles.terminalLine} ${styles[`terminal-line-${line.level}`]}`}
              layout
            >
              <motion.span
                className={styles.terminalTimestamp}
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.7 }}
                transition={{ delay: index * 0.02 + 0.1 }}
              >
                {formatTimestamp(line.timestamp)}
              </motion.span>
              <motion.span
                className={styles.terminalLevel}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.02 + 0.15, type: 'spring', stiffness: 500 }}
              >
                {getLevelSymbol(line.level)}
              </motion.span>
              <motion.span
                className={styles.terminalMessage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02 + 0.2 }}
              >
                {highlightSearchTerm(line.content, searchTerm)}
              </motion.span>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredLines.length === 0 && searchTerm && (
          <motion.div
            className={styles.terminalEmpty}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            No logs match your search
            <motion.span
              variants={cursorVariants}
              animate="blink"
              className={styles.cursor}
              style={{ display: 'inline-block', marginLeft: '4px' }}
            >
              _
            </motion.span>
          </motion.div>
        )}

        {lines.length === 0 && !searchTerm && (
          <motion.div
            className={styles.terminalEmpty}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: 'auto' }}
              transition={{ duration: 1, ease: 'easeInOut' }}
              style={{ display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap' }}
            >
              Waiting for logs...
            </motion.span>
            <motion.span
              variants={cursorVariants}
              animate="blink"
              className={styles.cursor}
              style={{ display: 'inline-block', marginLeft: '4px' }}
            >
              _
            </motion.span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
