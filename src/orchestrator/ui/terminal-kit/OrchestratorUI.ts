// Terminal-Kit based Orchestrator UI

import termkit from 'terminal-kit';
import { Task, WorkerInfo, TaskStatus } from '../../../shared/types.js';
import { StateManager, StateEvent } from '../../../shared/StateManager.js';
import { TaskManager } from '../../core/TaskManager.js';
import { WorkerWebSocketServer } from '../../websocket/WorkerWebSocketServer.js';
import * as fs from 'fs';
import {Shutdownable} from "../../../shared/Shutdownable.js";

const term = termkit.terminal;
// const DEBUG_LOG = 'C:\\temp\\orchestrator-ui-debug.log';
const DEBUG_LOG = 'C:\\Workspace_Tooling\\agent-fleet\\orchestrator-ui-debug.log';

function debugLog(msg: string): void {
  try {
    fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - ${msg}\n`);
  } catch (e) {
    // Ignore
  }
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.BACKLOG]: 'gray',
  [TaskStatus.REFINING]: 'cyan',
  [TaskStatus.REFINED]: 'cyan',
  [TaskStatus.PRIORITIZING]: 'cyan',
  [TaskStatus.TODO]: 'blue',
  [TaskStatus.IN_PROGRESS]: 'yellow',
  [TaskStatus.TESTING]: 'magenta',
  [TaskStatus.REVIEW]: 'magenta',
  [TaskStatus.REVIEWING]: 'magenta',
  [TaskStatus.CHANGES_REQUESTED]: 'yellow',
  [TaskStatus.APPROVED]: 'green',
  [TaskStatus.MERGED]: 'green',
  [TaskStatus.BLOCKED]: 'red',
  [TaskStatus.CANCELLED]: 'red'
};

// Draw a single-line box
function drawSingleBox(screenBuffer: any, x: number, y: number, width: number, height: number, color: string): void {
  screenBuffer.put({ x, y, attr: { color } }, '┌' + '─'.repeat(width - 2) + '┐');
  for (let i = 1; i < height - 1; i++) {
    screenBuffer.put({ x, y: y + i, attr: { color } }, '│');
    screenBuffer.put({ x: x + width - 1, y: y + i, attr: { color } }, '│');
  }
  screenBuffer.put({ x, y: y + height - 1, attr: { color } }, '└' + '─'.repeat(width - 2) + '┘');
}

// Draw a double-line box
function drawDoubleBox(screenBuffer: any, x: number, y: number, width: number, height: number, color: string): void {
  screenBuffer.put({ x, y, attr: { color } }, '╔' + '═'.repeat(width - 2) + '╗');
  for (let i = 1; i < height - 1; i++) {
    screenBuffer.put({ x, y: y + i, attr: { color } }, '║');
    screenBuffer.put({ x: x + width - 1, y: y + i, attr: { color } }, '║');
  }
  screenBuffer.put({ x, y: y + height - 1, attr: { color } }, '╚' + '═'.repeat(width - 2) + '╝');
}

// Truncate text to fit width
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export class OrchestratorUI {
  private taskManager: TaskManager;
  private wsServer: WorkerWebSocketServer | null;
  private shutdownable: Shutdownable;

  private stateManager: StateManager;
  private screenBuffer: any;
  private running: boolean = false;
  private renderInterval: NodeJS.Timeout | null = null;
  private originalConsole: { log: typeof console.log; error: typeof console.error; warn: typeof console.warn } | null = null;

  private tasks: Task[] = [];
  private workers: WorkerInfo[] = [];
  private logs: string[] = [];

  constructor(taskManager: TaskManager, shutdownable: Shutdownable, wsServer: WorkerWebSocketServer | null) {
    this.taskManager = taskManager;
    this.shutdownable = shutdownable;
    this.wsServer = wsServer;
    this.stateManager = StateManager.getInstance();

    // Load initial data
    this.tasks = taskManager.getAllTasks();
    this.workers = wsServer ? wsServer.getWorkers() : [];
  }

  start(): void {
    debugLog('=== START() CALLED ===');
    debugLog(`Stack trace: ${new Error().stack}`);

    if (this.running) {
      debugLog('WARNING: start() called while already running!');
      return;
    }

    this.running = true;

    // Intercept console.log to prevent logs from pushing UI
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn
    };
    debugLog('Console intercepted');

    // Redirect console output to logs array via StateManager
    console.log = (...args: any[]) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.stateManager.emit(StateEvent.LOG_MESSAGE, { message });
    };

    console.error = (...args: any[]) => {
      const message = '[ERROR] ' + args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.stateManager.emit(StateEvent.LOG_MESSAGE, { message });
    };

    console.warn = (...args: any[]) => {
      const message = '[WARN] ' + args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      this.stateManager.emit(StateEvent.LOG_MESSAGE, { message });
    };

    // Enable alternate screen buffer
    debugLog('Calling term.fullscreen(true)');
    term.fullscreen(true);
    term.hideCursor();
    debugLog('Terminal fullscreen enabled');

    // Create screen buffer for efficient rendering
    const width = (term.width && isFinite(term.width)) ? term.width : 120;
    const height = (term.height && isFinite(term.height)) ? term.height : 30;
    debugLog(`Terminal size: ${width}x${height}`);

    debugLog('Creating ScreenBuffer');
    this.screenBuffer = new termkit.ScreenBuffer({
      dst: term,
      width,
      height,
    });
    debugLog('ScreenBuffer created');

    // Handle terminal resize
    debugLog('Attaching resize handler');
    term.on('resize', (width: number, height: number) => {
      debugLog(`RESIZE EVENT: ${width}x${height}`);
      this.screenBuffer = new termkit.ScreenBuffer({
        dst: term,
        width,
        height,
      });
      this.render();
    });
    debugLog('Resize handler attached');

    // Handle keyboard input
    debugLog(`STDIN state BEFORE grabInput: isTTY=${process.stdin.isTTY}, isRaw=${process.stdin.isRaw}, readable=${process.stdin.readable}`);
    debugLog(`STDIN listeners: ${JSON.stringify(process.stdin.eventNames())}`);

    // Remove "pause" and "end" listeners that might be blocking keyboard input
    const pauseListeners = process.stdin.listeners('pause');
    const endListeners = process.stdin.listeners('end');
    debugLog(`Found ${pauseListeners.length} pause listeners and ${endListeners.length} end listeners`);
    process.stdin.removeAllListeners('pause');
    process.stdin.removeAllListeners('end');
    debugLog('Removed pause and end listeners');

    debugLog('Calling term.grabInput(true)');
    term.grabInput(true);
    debugLog('term.grabInput(true) returned');
    debugLog(`STDIN state AFTER grabInput: isTTY=${process.stdin.isTTY}, isRaw=${process.stdin.isRaw}, readable=${process.stdin.readable}`);

    debugLog('Attaching key handler');
    term.on('key', (name: string) => {
      debugLog(`KEY EVENT: ${name}`);
      if (name === 'q' || name === 'Q' || name === 'CTRL_C') {
        debugLog(`${name} pressed - sending SIGINT`);
        
        this.shutdownable.shutdown();
        
        // User pressed Q or CTRL+C - trigger graceful shutdown
        //process.kill(process.pid, 'SIGINT');
      }
    });
    debugLog('Key handler attached');

    // Subscribe to state changes
    this.stateManager.on(StateEvent.TASK_CREATED, () => {
      this.tasks = this.taskManager.getAllTasks();
      this.render();
    });

    this.stateManager.on(StateEvent.TASK_UPDATED, () => {
      this.tasks = this.taskManager.getAllTasks();
      this.render();
    });

    this.stateManager.on(StateEvent.TASK_DELETED, () => {
      this.tasks = this.taskManager.getAllTasks();
      this.render();
    });

    this.stateManager.on(StateEvent.WORKER_CONNECTED, () => {
      this.workers = this.wsServer ? this.wsServer.getWorkers() : [];
      this.render();
    });

    this.stateManager.on(StateEvent.WORKER_DISCONNECTED, () => {
      this.workers = this.wsServer ? this.wsServer.getWorkers() : [];
      this.render();
    });

    this.stateManager.on(StateEvent.WORKER_TASK_ASSIGNED, () => {
      this.workers = this.wsServer ? this.wsServer.getWorkers() : [];
      this.render();
    });

    this.stateManager.on(StateEvent.WORKER_TASK_RELEASED, () => {
      this.workers = this.wsServer ? this.wsServer.getWorkers() : [];
      this.render();
    });

    this.stateManager.on(StateEvent.LOG_MESSAGE, (data: { message: string }) => {
      this.logs.push(data.message);
      // Keep only last 8 logs
      this.logs = this.logs.slice(-8);
      this.render();
    });

    // Initial render
    debugLog('Calling initial render');
    this.render();
    debugLog('Initial render completed');

    // Periodic render for time updates
    this.renderInterval = setInterval(() => {
      this.render();
    }, 1000);
    debugLog('=== START() COMPLETED ===');
  }

  stop(): void {
    debugLog('=== STOP() CALLED ===');
    this.running = false;

    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }

    // Restore original console functions
    if (this.originalConsole) {
      console.log = this.originalConsole.log;
      console.error = this.originalConsole.error;
      console.warn = this.originalConsole.warn;
      this.originalConsole = null;
    }

    // // Restore terminal
    // term.grabInput(false);
    // term.clear();  // Clear screen before exiting fullscreen
    // term.fullscreen(false);
    // term.hideCursor(false);
    // debugLog('Terminal restored');


    term.grabInput(false);
    term.fullscreen(false);
  }

  unmount(): void {
    this.stop();
  }

  private render(): void {
    debugLog(`=== RENDER CALLED === running: ${this.running}`);
    if (!this.running) {
      debugLog('RENDER: Skipped (not running)');
      return;
    }

    // Get terminal dimensions
    const width = (term.width && isFinite(term.width)) ? term.width : 120;
    const height = (term.height && isFinite(term.height)) ? term.height : 30;
    debugLog(`RENDER: Terminal size ${width}x${height}`);

    // Clear the screen buffer
    debugLog('RENDER: Clearing screen buffer');
    this.screenBuffer.fill({
      char: ' ',
      attr: { color: 'default' }
    });
    debugLog('RENDER: Screen buffer cleared');

    let currentY = 1;

    // ═══ Header ═══
    drawDoubleBox(this.screenBuffer, 1, currentY, width - 2, 3, 'cyan');
    this.screenBuffer.put({ x: 3, y: currentY + 1, attr: { color: 'cyan', bold: true } },
      'Agent Fleet Orchestrator'
    );
    currentY += 4;

    // ═══ Logs Section ═══
    const logsHeight = 6;
    drawSingleBox(this.screenBuffer, 1, currentY, width - 2, logsHeight, 'gray');
    this.screenBuffer.put({ x: 3, y: currentY, attr: { color: 'gray' } }, '┤ Logs (last 8 lines) ├');

    let logY = currentY + 1;
    if (this.logs.length === 0) {
      this.screenBuffer.put({ x: 3, y: logY, attr: { color: 'gray', dim: true } }, 'No logs yet');
    } else {
      for (const log of this.logs) {
        if (logY >= currentY + logsHeight - 1) break;
        this.screenBuffer.put({ x: 3, y: logY, attr: { color: 'gray', dim: true } },
          truncate(log, width - 6)
        );
        logY++;
      }
    }

    currentY += logsHeight + 1;

    // ═══ Main Content: Tasks and Workers ═══
    const contentHeight = height - currentY - 3;
    const leftWidth = Math.floor((width - 3) * 0.6);
    const rightWidth = width - leftWidth - 3;

    // Left column: Tasks
    drawSingleBox(this.screenBuffer, 1, currentY, leftWidth, contentHeight, 'gray');
    this.screenBuffer.put({ x: 3, y: currentY, attr: { color: 'cyan' } },
      `┤ Tasks (${this.tasks.length}) ├`
    );

    let taskY = currentY + 1;
    if (this.tasks.length === 0) {
      this.screenBuffer.put({ x: 3, y: taskY, attr: { color: 'gray', dim: true } }, 'No tasks');
    } else {
      // Group tasks by status
      const tasksByStatus = this.tasks.reduce((acc, task) => {
        if (!acc[task.status]) {
          acc[task.status] = [];
        }
        acc[task.status].push(task);
        return acc;
      }, {} as Record<TaskStatus, Task[]>);

      // Render tasks by status
      for (const [status, statusTasks] of Object.entries(tasksByStatus)) {
        if (taskY >= currentY + contentHeight - 1) break;

        const color = STATUS_COLORS[status as TaskStatus] || 'white';
        this.screenBuffer.put({ x: 3, y: taskY, attr: { color, bold: true } },
          `${status.toUpperCase()} (${statusTasks.length})`
        );
        taskY++;

        for (const task of statusTasks as Task[]) {
          if (taskY >= currentY + contentHeight - 1) break;

          const taskIdShort = task.id.substring(0, 8);
          const taskDesc = truncate(task.description, leftWidth - 20);
          let taskLine = `  [${taskIdShort}] ${taskDesc}`;

          if (task.assignedTo) {
            taskLine += ` [W:${task.assignedTo.workerId.substring(0, 4)}]`;
          }

          this.screenBuffer.put({ x: 3, y: taskY }, truncate(taskLine, leftWidth - 6));
          taskY++;

          // Show flow info if available
          if (task.flowId && taskY < currentY + contentHeight - 1) {
            const flowInfo = `    Flow: ${task.flowId}`;
            this.screenBuffer.put({ x: 3, y: taskY, attr: { color: 'gray', dim: true } },
              truncate(flowInfo, leftWidth - 6)
            );
            taskY++;
          }
        }

        taskY++; // Space between status groups
      }
    }

    // Right column: Workers
    drawSingleBox(this.screenBuffer, leftWidth + 2, currentY, rightWidth, contentHeight, 'gray');
    this.screenBuffer.put({ x: leftWidth + 4, y: currentY, attr: { color: 'cyan' } },
      `┤ Workers (${this.workers.length}) ├`
    );

    let workerY = currentY + 1;
    if (this.workers.length === 0) {
      this.screenBuffer.put({ x: leftWidth + 4, y: workerY, attr: { color: 'gray', dim: true } },
        'No workers connected'
      );
    } else {
      for (const worker of this.workers) {
        if (workerY >= currentY + contentHeight - 1) break;

        const workerIdShort = worker.id.substring(0, 8);
        this.screenBuffer.put({ x: leftWidth + 4, y: workerY, attr: { color: 'green', bold: true } },
          `Worker ${workerIdShort}`
        );
        this.screenBuffer.put({ x: leftWidth + 4 + 15, y: workerY, attr: { color: 'gray', dim: true } },
          `(${worker.type})`
        );
        workerY++;

        const currentTask = worker.taskId ? this.tasks.find(t => t.id === worker.taskId) : null;
        if (currentTask) {
          const taskDesc = truncate(currentTask.description, rightWidth - 12);
          this.screenBuffer.put({ x: leftWidth + 6, y: workerY, attr: { color: 'yellow' } },
            `▶ ${taskDesc}`
          );
          workerY++;
          this.screenBuffer.put({ x: leftWidth + 8, y: workerY, attr: { color: 'gray', dim: true } },
            `[${currentTask.status}]`
          );
        } else {
          this.screenBuffer.put({ x: leftWidth + 6, y: workerY, attr: { color: 'gray', dim: true } },
            'Idle'
          );
        }
        workerY++;
        workerY++; // Space between workers
      }
    }

    currentY += contentHeight + 1;

    // ═══ Footer ═══
    this.screenBuffer.put({ x: 2, y: currentY, attr: { color: 'gray', dim: true } },
      'Press Q to quit'
    );

    // Draw the screen buffer to terminal (only changed cells)
    debugLog('RENDER: Calling screenBuffer.draw()');
    this.screenBuffer.draw({ delta: true });
    debugLog('RENDER: Completed');
  }
}

// Export function to create UI (caller must call start())
export function renderUI(taskManager: TaskManager, shutdownable: Shutdownable, wsServer: WorkerWebSocketServer | null): OrchestratorUI {
  const ui = new OrchestratorUI(taskManager, shutdownable, wsServer);
  return ui;
}
