// Terminal-Kit based FlowWorker UI
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Shutdownable } from 'shared-common/Shutdownable.js';
import termkit from 'terminal-kit';

import { UIStateManager } from '../shared/StateManager.js';
import { CompactDashboard } from './views/CompactDashboard.js';
import { FullScreenLogs } from './views/FullScreenLogs.js';
import { SidePanelView } from './views/SidePanelView.js';
import { SplitView } from './views/SplitView.js';
import { TimelineView } from './views/TimelineView.js';

const term = termkit.terminal;

type ViewType = 'split' | 'compact' | 'timeline' | 'fullscreen' | 'sidepanel';

const VIEW_PREFERENCE_FILE = path.join(os.homedir(), '.agent-fleet-view-preference');

const DEBUG_LOG = 'C:\\Workspace_Tooling\\agent-fleet\\flowworker-ui-debug.log';

function debugLog(msg: string): void {
	try {
		fs.appendFileSync(DEBUG_LOG, `${new Date().toISOString()} - ${msg}\n`);
	} catch (e) {
		// Ignore
	}
}

// Load saved view preference
function loadViewPreference(): ViewType {
	try {
		if (fs.existsSync(VIEW_PREFERENCE_FILE)) {
			const saved = fs.readFileSync(VIEW_PREFERENCE_FILE, 'utf-8').trim();
			if (['split', 'compact', 'timeline', 'fullscreen', 'sidepanel'].includes(saved)) {
				return saved as ViewType;
			}
		}
	} catch (err) {
		// Ignore errors
	}
	return 'fullscreen'; // Default
}

// Save view preference
function saveViewPreference(view: ViewType): void {
	try {
		fs.writeFileSync(VIEW_PREFERENCE_FILE, view, 'utf-8');
	} catch (err) {
		// Ignore errors
	}
}

export class FlowWorkerUI {
	private stateManager: UIStateManager;
	private shutdownable: Shutdownable;

	private screenBuffer: any;
	private currentView: ViewType;
	private running: boolean = false;
	private renderInterval: NodeJS.Timeout | null = null;
	private originalConsole: {
		log: typeof console.log;
		error: typeof console.error;
		warn: typeof console.warn;
	} | null = null;

	constructor(stateManager: UIStateManager, shutdownable: Shutdownable, initialView?: ViewType) {
		this.stateManager = stateManager;
		this.shutdownable = shutdownable;

		// Load from preference file or use provided initial view or default
		this.currentView = initialView || loadViewPreference();
	}

	start(): void {
		this.running = true;

		// Intercept console.log to prevent logs from pushing UI
		this.originalConsole = {
			log: console.log,
			error: console.error,
			warn: console.warn,
		};

		// Redirect console output to StateManager
		console.log = (...args: any[]) => {
			const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
			this.stateManager.addLog('info', message);
		};

		console.error = (...args: any[]) => {
			const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
			this.stateManager.addLog('error', message);
		};

		console.warn = (...args: any[]) => {
			const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
			this.stateManager.addLog('warning', message);
		};

		// Enable alternate screen buffer
		term.fullscreen(true);
		term.hideCursor();

		// Create screen buffer for efficient rendering
		// Use default dimensions if terminal dimensions are not available
		const width = term.width && isFinite(term.width) ? term.width : 120;
		const height = term.height && isFinite(term.height) ? term.height : 30;

		this.screenBuffer = new termkit.ScreenBuffer({
			dst: term,
			width,
			height,
		});

		debugLog(
			`STDIN state BEFORE grabInput: isTTY=${process.stdin.isTTY}, isRaw=${process.stdin.isRaw}, readable=${process.stdin.readable}`
		);
		debugLog(`STDIN listeners: ${JSON.stringify(process.stdin.eventNames())}`);

		// Remove "pause" and "end" listeners that might be blocking keyboard input
		const pauseListeners = process.stdin.listeners('pause');
		const endListeners = process.stdin.listeners('end');
		debugLog(`Found ${pauseListeners.length} pause listeners and ${endListeners.length} end listeners`);

		// Handle terminal resize
		term.on('resize', (width: number, height: number) => {
			// Recreate screen buffer with new dimensions
			this.screenBuffer = new termkit.ScreenBuffer({
				dst: term,
				width,
				height,
			});
			this.render();
		});

		// Handle keyboard input
		term.grabInput(true);

		term.on('key', (name: string) => {
			//console.info(`Key pressed: ${name}`);

			switch (name) {
				// User pressed Q or CTRL+C - trigger graceful shutdown
				case 'q':
				case 'Q':
				case 'CTRL_C':
					// process.kill(process.pid, 'SIGINT');
					// this.stop();
					this.shutdownable.shutdown();
					break;
				case 'p':
				case 'P':
					this.stateManager.togglePause();
					break;
				case '1':
					this.currentView = 'split';
					saveViewPreference(this.currentView);
					this.render();
					break;
				case '2':
					this.currentView = 'compact';
					saveViewPreference(this.currentView);
					this.render();
					break;
				case '3':
					this.currentView = 'timeline';
					saveViewPreference(this.currentView);
					this.render();
					break;
				case '4':
					this.currentView = 'fullscreen';
					saveViewPreference(this.currentView);
					this.render();
					break;
				case '5':
					this.currentView = 'sidepanel';
					saveViewPreference(this.currentView);
					this.render();
					break;
			}
		});

		// Subscribe to state changes
		this.stateManager.subscribe(() => {
			this.render();
		});

		// Initial render
		this.render();

		// Periodic render for elapsed time updates
		this.renderInterval = setInterval(() => {
			const state = this.stateManager.getState();
			if (!state.paused && !state.taskCompleted) {
				this.stateManager.updateElapsedTime();
				this.render();
			}
		}, 1000);
	}

	stop(): void {
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
		//
		// // Exit fullscreen mode (restores previous buffer)
		// term.fullscreen(false);
		//
		// // Clear the restored terminal completely
		// term.clear();
		//
		// // Alternative: Try ANSI escape codes for complete reset
		// term('\x1B[2J\x1B[H');  // Clear screen and move to home
		//
		// term.hideCursor(false);  // Show cursor

		console.log('Stopping FlowWorkerUI...');

		// 1) working
		term.grabInput(false);
		term.fullscreen(false);

		// 2) not working
		// term('\x1b[?1049l');

		// // 3) not working
		// term.hideCursor(false);
		// term.grabInput(false);

		// // 4) ?
		// term.hideCursor(false);
		// term.grabInput(false);
		// term.clear();

		// process.exit(0);
	}

	getStateManager(): UIStateManager {
		return this.stateManager;
	}

	private render(): void {
		if (!this.running) return;

		// Get terminal dimensions (use defaults if not available)
		const width = term.width && isFinite(term.width) ? term.width : 120;
		const height = term.height && isFinite(term.height) ? term.height : 30;

		// Clear the screen buffer
		this.screenBuffer.fill({
			char: ' ',
			attr: { color: 'default' },
		});

		// Render the current view
		const state = this.stateManager.getState();

		switch (this.currentView) {
			case 'split':
				SplitView.render(this.screenBuffer, state, width, height);
				break;
			case 'compact':
				CompactDashboard.render(this.screenBuffer, state, width, height);
				break;
			case 'timeline':
				TimelineView.render(this.screenBuffer, state, width, height);
				break;
			case 'fullscreen':
				FullScreenLogs.render(this.screenBuffer, state, width, height);
				break;
			case 'sidepanel':
				SidePanelView.render(this.screenBuffer, state, width, height);
				break;
		}

		// Draw the screen buffer to terminal (only changed cells)
		this.screenBuffer.draw({ delta: true });
	}
}

// Export function to create and start UI
export function createFlowWorkerUI(
	workerId: string,
	orchestratorUrl: string,
	shutdownable: Shutdownable
): FlowWorkerUI {
	const stateManager = new UIStateManager(workerId, orchestratorUrl);
	const ui = new FlowWorkerUI(stateManager, shutdownable);
	return ui;
}
