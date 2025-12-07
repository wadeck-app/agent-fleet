/**
 * CommandPalette - Feature component
 * Searchable command palette with keyboard navigation
 * Enhanced with Framer Motion animations
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './CommandPalette.module.scss';

export interface Command {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: string;
  action: () => void;
  category?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(search.toLowerCase()) ||
      cmd.description?.toLowerCase().includes(search.toLowerCase()) ||
      cmd.category?.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const command = filteredCommands[selectedIndex];
        if (command) {
          command.action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  if (!isOpen) return null;

  const groupedCommands: { [key: string]: Command[] } = {};
  filteredCommands.forEach((cmd) => {
    const category = cmd.category || 'Other';
    if (!groupedCommands[category]) {
      groupedCommands[category] = [];
    }
    groupedCommands[category].push(cmd);
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.commandPaletteOverlay}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className={styles.commandPalette}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
          >
            <motion.div
              className={styles.commandPaletteInputWrapper}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <motion.span
                className={styles.commandPaletteIcon}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 500 }}
              >
                ›
              </motion.span>
              <input
                ref={inputRef}
                type="text"
                className={styles.commandPaletteInput}
                placeholder="Type a command or search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </motion.div>

            <motion.div
              className={styles.commandPaletteResults}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <AnimatePresence mode="wait">
                {Object.keys(groupedCommands).length === 0 ? (
                  <motion.div
                    key="empty"
                    className={styles.commandPaletteEmpty}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    No commands found
                  </motion.div>
                ) : (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {Object.entries(groupedCommands).map(([category, cmds], categoryIndex) => (
                      <motion.div
                        key={category}
                        className={styles.commandPaletteGroup}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: categoryIndex * 0.05 }}
                      >
                        <motion.div
                          className={styles.commandPaletteGroupTitle}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: categoryIndex * 0.05 + 0.1 }}
                        >
                          {category}
                        </motion.div>
                        <AnimatePresence mode="popLayout">
                          {cmds.map((cmd, cmdIndex) => {
                            const globalIndex = filteredCommands.indexOf(cmd);
                            return (
                              <motion.button
                                key={cmd.id}
                                className={`${styles.commandPaletteItem} ${
                                  globalIndex === selectedIndex ? styles.commandPaletteItemSelected : ''
                                }`}
                                onClick={() => {
                                  cmd.action();
                                  onClose();
                                }}
                                onMouseEnter={() => setSelectedIndex(globalIndex)}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 10 }}
                                transition={{ delay: categoryIndex * 0.05 + cmdIndex * 0.03 }}
                                whileHover={{ x: 4, transition: { duration: 0.2 } }}
                                layout
                              >
                                <div className={styles.commandPaletteItemContent}>
                                  {cmd.icon && (
                                    <motion.span
                                      className={styles.commandPaletteItemIcon}
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      transition={{
                                        delay: categoryIndex * 0.05 + cmdIndex * 0.03 + 0.1,
                                        type: 'spring',
                                        stiffness: 500,
                                      }}
                                    >
                                      {cmd.icon}
                                    </motion.span>
                                  )}
                                  <div className={styles.commandPaletteItemText}>
                                    <div className={styles.commandPaletteItemLabel}>{cmd.label}</div>
                                    {cmd.description && (
                                      <div className={styles.commandPaletteItemDescription}>{cmd.description}</div>
                                    )}
                                  </div>
                                </div>
                                {cmd.shortcut && (
                                  <motion.div
                                    className={styles.commandPaletteItemShortcut}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 0.7 }}
                                    transition={{ delay: categoryIndex * 0.05 + cmdIndex * 0.03 + 0.15 }}
                                  >
                                    {cmd.shortcut}
                                  </motion.div>
                                )}
                              </motion.button>
                            );
                          })}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
