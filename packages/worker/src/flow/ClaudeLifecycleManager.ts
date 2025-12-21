/**
 * Claude Lifecycle Manager
 *
 * Manages Claude process lifecycle (spawn, kill, track).
 * Handles platform-specific process termination and WebSocket communication.
 */
import { ChildProcess, execSync } from 'child_process';
import { WebSocket, WebSocketServer } from 'ws';

/**
 * Message types received from Claude processes
 */
interface ClaudeMessage {
	type: string;
	hookName?: string;
	[key: string]: any;
}

/**
 * Callback for handling Claude messages
 */
export type ClaudeMessageHandler = (message: ClaudeMessage) => void;

/**
 * Claude Lifecycle Manager class
 */
export class ClaudeLifecycleManager {
	private claudeWss: WebSocketServer | null = null;
	private claudeWsPort: number = 0;
	private claudeSocket: WebSocket | null = null;
	private claudeProcess: ChildProcess | null = null;
	private messageHandler: ClaudeMessageHandler | null = null;
	private logPrefix: string;

	constructor(logPrefix: string = '[ClaudeLifecycleManager]') {
		this.logPrefix = logPrefix;
		this.setupWebSocketServer();
	}

	/**
	 * Setup WebSocket server for Claude processes to communicate with this worker
	 */
	private setupWebSocketServer(): void {
		// Create WebSocket server on a random available port
		this.claudeWss = new WebSocketServer({ port: 0 });

		this.claudeWss.on('listening', () => {
			const address = this.claudeWss!.address();
			if (typeof address === 'object' && address !== null) {
				this.claudeWsPort = address.port;
				console.log(`${this.logPrefix} Claude WebSocket server listening on port ${this.claudeWsPort}`);
			}
		});

		this.claudeWss.on('connection', (socket: WebSocket) => {
			console.log(`${this.logPrefix} Claude process connected to worker socket`);
			this.claudeSocket = socket;

			socket.on('message', (data: Buffer) => {
				try {
					const message = JSON.parse(data.toString());
					this.handleClaudeMessage(message);
				} catch (error) {
					console.error(`${this.logPrefix} Error parsing Claude message:`, error);
				}
			});

			socket.on('close', () => {
				console.log(`${this.logPrefix} Claude socket disconnected`);
				this.claudeSocket = null;
			});

			socket.on('error', error => {
				console.error(`${this.logPrefix} Claude socket error:`, error);
			});
		});

		this.claudeWss.on('error', error => {
			console.error(`${this.logPrefix} Claude WebSocket server error:`, error);
		});
	}

	/**
	 * Handle messages from Claude processes (via hooks)
	 */
	private handleClaudeMessage(message: ClaudeMessage): void {
		// Delegate to the registered handler if available
		if (this.messageHandler) {
			this.messageHandler(message);
		} else {
			// Default handling
			switch (message.type) {
				case 'STOP_REQUESTED':
					console.log(`${this.logPrefix} Stop requested by Claude, killing process...`);
					this.kill();
					break;

				case 'HOOK_EVENT':
					console.log(`${this.logPrefix} Hook event: ${message.hookName}`);
					break;

				default:
					console.log(`${this.logPrefix} Unknown message type: ${message.type}`);
			}
		}
	}

	/**
	 * Set a custom message handler for Claude messages
	 */
	setMessageHandler(handler: ClaudeMessageHandler): void {
		this.messageHandler = handler;
	}

	/**
	 * Get the WebSocket port for Claude to connect to
	 */
	getWebSocketPort(): number {
		return this.claudeWsPort;
	}

	/**
	 * Track a Claude process that has been started
	 */
	trackProcess(process: ChildProcess): void {
		this.claudeProcess = process;
	}

	/**
	 * Get the current Claude process (if any)
	 */
	getProcess(): ChildProcess | null {
		return this.claudeProcess;
	}

	/**
	 * Kill Claude process if running
	 */
	kill(): void {
		if (this.claudeProcess) {
			const pid = this.claudeProcess.pid;
			console.log(`${this.logPrefix} Killing Claude process (PID: ${pid})...`);

			try {
				if (pid && process.platform === 'win32') {
					try {
						execSync(`taskkill /PID ${pid} /T /F`, {
							stdio: 'inherit',
							windowsHide: false,
						});
						console.log(`${this.logPrefix} Process killed successfully`);
					} catch (killError: any) {
						if (!killError.message?.includes('not found')) {
							console.error(`${this.logPrefix} Kill error:`, killError.message);
						}
					}
				} else if (this.claudeProcess) {
					this.claudeProcess.kill('SIGKILL');
				}

				this.claudeProcess = null;
			} catch (error) {
				console.error(`${this.logPrefix} Error killing process:`, error);
				this.claudeProcess = null;
			}
		}
	}

	/**
	 * Cleanup on shutdown
	 */
	shutdown(): void {
		console.log(`${this.logPrefix} Shutting down...`);

		// Kill Claude if running
		this.kill();

		// Close Claude WebSocket server
		if (this.claudeWss) {
			console.log(`${this.logPrefix} Closing Claude WebSocket server...`);
			this.claudeWss.close(() => {
				console.log(`${this.logPrefix} Claude WebSocket server closed`);
			});
			this.claudeWss = null;
		}
	}
}
