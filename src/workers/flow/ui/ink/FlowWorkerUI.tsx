// Main FlowWorker UI Component with View Switcher

import React, { useState, useEffect } from 'react';
import { render, Box, useInput, useStdout } from 'ink';
import type { ViewType } from '../shared/types.js';
import { UIStateManager } from '../shared/StateManager.js';
import { SplitView } from './views/SplitView.js';
import { CompactDashboard } from './views/CompactDashboard.js';
import { TimelineView } from './views/TimelineView.js';
import { FullScreenLogs } from './views/FullScreenLogs.js';
import { SidePanelView } from './views/SidePanelView.js';
import {Shutdownable} from "../../../../shared/Shutdownable.js";

interface FlowWorkerUIProps {
  stateManager: UIStateManager;
  onExit: () => void;
}

function FlowWorkerUIComponent({ stateManager, onExit }: FlowWorkerUIProps): React.ReactElement {
  const [currentView, setCurrentView] = useState<ViewType>('fullscreen');
  const [state, setState] = useState(stateManager.getState());
  const { stdout } = useStdout();

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = stateManager.subscribe((newState) => {
      setState(newState);
    });

    // Update elapsed time every second
    const interval = setInterval(() => {
      if (!stateManager.getState().paused) {
        stateManager.updateElapsedTime();
      }
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [stateManager]);

  // Handle keyboard input (only if stdin supports raw mode)
  useInput((input, key) => {
    if (input === 'q' || input === 'Q' || (key.ctrl && input === 'c')) {
      onExit();
    } else if (input === 'p' || input === 'P') {
      stateManager.togglePause();
    } else if (input === '1') {
      setCurrentView('split');
    } else if (input === '2') {
      setCurrentView('compact');
    } else if (input === '3') {
      setCurrentView('timeline');
    } else if (input === '4') {
      setCurrentView('fullscreen');
    } else if (input === '5') {
      setCurrentView('sidepanel');
    }
  }, { isActive: process.stdin.isTTY !== false });

  const terminalHeight = stdout?.rows || 30;
  const terminalWidth = stdout?.columns || 120;

  const viewProps = {
    state,
    onViewChange: setCurrentView,
    currentView,
    terminalHeight,
    terminalWidth
  };

  return (
    <Box flexDirection="column" height={terminalHeight} width={terminalWidth} minHeight={terminalHeight}>
      {currentView === 'split' && <SplitView {...viewProps} />}
      {currentView === 'compact' && <CompactDashboard {...viewProps} />}
      {currentView === 'timeline' && <TimelineView {...viewProps} />}
      {currentView === 'fullscreen' && <FullScreenLogs {...viewProps} />}
      {currentView === 'sidepanel' && <SidePanelView {...viewProps} />}
    </Box>
  );
}

export class FlowWorkerUI {
  private stateManager: UIStateManager;
  private inkInstance: any;

  constructor(stateManager: UIStateManager) {
    this.stateManager = stateManager;
  }

  start(): void {
    // Enable alternate screen buffer BEFORE Ink starts
    process.stdout.write('\x1b[?1049h'); // Enter alternate screen
    process.stdout.write('\x1b[2J');     // Clear screen
    process.stdout.write('\x1b[H');      // Move cursor to home

    // @formatter:off
    this.inkInstance = render(
      <FlowWorkerUIComponent
        stateManager={this.stateManager}
        onExit={() => this.stop()}
      />,
      {
        // Don't exit on Ctrl+C (we handle it ourselves)
        exitOnCtrlC: false,
        // Important: Don't patch console to avoid conflicts
        patchConsole: false,
        // Use stdout for output
        stdout: process.stdout,
        stdin: process.stdin,
        // Enable debug mode to see what's happening
        debug: false
      }
    );
    // @formatter:on
  }

  stop(): void {
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = null;
    }
    // Exit alternate screen buffer
    process.stdout.write('\x1b[?1049l');
    // Exit the process
    process.exit(0);
  }

  getStateManager(): UIStateManager {
    return this.stateManager;
  }
}

// Export function to create and start UI
export function createFlowWorkerUI(workerId: string, orchestratorUrl: string, shutdownable: Shutdownable): FlowWorkerUI {
  const stateManager = new UIStateManager(workerId, orchestratorUrl);
  const ui = new FlowWorkerUI(stateManager);
  return ui;
}
