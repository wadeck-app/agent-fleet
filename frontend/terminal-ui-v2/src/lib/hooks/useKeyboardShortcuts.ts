/**
 * useKeyboardShortcuts - Custom hook for global keyboard shortcuts
 * Extracts keyboard shortcut logic from App component
 */

import { useEffect } from 'react';

export interface KeyboardShortcutHandlers {
  onCommandPalette?: () => void;
  onNewTask?: () => void;
  onSettings?: () => void;
}

export function useKeyboardShortcuts({
  onCommandPalette,
  onNewTask,
  onSettings,
}: KeyboardShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onCommandPalette?.();
      }
      // Command/Ctrl + N for new task
      else if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        onNewTask?.();
      }
      // Command/Ctrl + , for settings
      else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        onSettings?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCommandPalette, onNewTask, onSettings]);
}
