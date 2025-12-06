/**
 * CommandPalette - Feature component
 * Searchable command palette with keyboard navigation
 */

import { useState, useEffect, useRef } from 'react';
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
    <div className={styles.commandPaletteOverlay} onClick={onClose}>
      <div className={`${styles.commandPalette} ${styles.slideUp}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.commandPaletteInputWrapper}>
          <span className={styles.commandPaletteIcon}>›</span>
          <input
            ref={inputRef}
            type="text"
            className={styles.commandPaletteInput}
            placeholder="Type a command or search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.commandPaletteResults}>
          {Object.keys(groupedCommands).length === 0 ? (
            <div className={styles.commandPaletteEmpty}>No commands found</div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category} className={styles.commandPaletteGroup}>
                <div className={styles.commandPaletteGroupTitle}>{category}</div>
                {cmds.map((cmd) => {
                  const globalIndex = filteredCommands.indexOf(cmd);
                  return (
                    <button
                      key={cmd.id}
                      className={`${styles.commandPaletteItem} ${
                        globalIndex === selectedIndex ? styles.commandPaletteItemSelected : ''
                      }`}
                      onClick={() => {
                        cmd.action();
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                    >
                      <div className={styles.commandPaletteItemContent}>
                        {cmd.icon && <span className={styles.commandPaletteItemIcon}>{cmd.icon}</span>}
                        <div className={styles.commandPaletteItemText}>
                          <div className={styles.commandPaletteItemLabel}>{cmd.label}</div>
                          {cmd.description && (
                            <div className={styles.commandPaletteItemDescription}>{cmd.description}</div>
                          )}
                        </div>
                      </div>
                      {cmd.shortcut && (
                        <div className={styles.commandPaletteItemShortcut}>{cmd.shortcut}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
