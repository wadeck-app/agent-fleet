/**
 * Claude Lifecycle Manager
 *
 * Manages Claude process lifecycle (spawn, kill, track).
 * Handles platform-specific process termination and WebSocket communication.
 */
import type { ChildProcess } from 'node:child_process';
import { execSync } from 'node:child_process';
import { type Logger, createLogger } from 'shared-common/logger';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

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
	private logger: Logger;

	constructor(workerId: string) {
		this.logger = createLogger(`ClaudeLifecycle[${workerId}]`);
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
				this.logger.info(` Claude WebSocket server listening on port ${this.claudeWsPort}`);
			}
		});

		this.claudeWss.on('connection', (socket: WebSocket) => {
			this.logger.info(` Claude process connected to worker socket`);
			this.claudeSocket = socket;

			socket.on('message', (data: Buffer) => {
				try {
					const message = JSON.parse(data.toString());
					this.handleClaudeMessage(message);
				} catch (error) {
					this.logger.error(`} Error parsing Claude message:`, error);
				}
			});

			socket.on('close', () => {
				this.logger.info(` Claude socket disconnected`);
				this.claudeSocket = null;
			});

			socket.on('error', error => {
				this.logger.error(`} Claude socket error:`, error);
			});
		});

		this.claudeWss.on('error', error => {
			this.logger.error(`} Claude WebSocket server error:`, error);
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
					this.logger.info(` Stop requested by Claude, killing process...`);
					this.kill();
					break;

				case 'HOOK_EVENT':
					this.logger.info(` Hook event: ${message.hookName}`);
					break;

				default:
					this.logger.info(` Unknown message type: ${message.type}`);
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
			this.logger.info(` Killing Claude process (PID: ${pid})...`);

			try {
				if (pid && process.platform === 'win32') {
					try {
						execSync(`taskkill /PID ${pid} /T /F`, {
							stdio: 'inherit',
							windowsHide: true,
						});
						this.logger.info(` Process killed successfully`);
					} catch (killError: any) {
						if (!killError.message?.includes('not found')) {
							this.logger.error(`} Kill error:`, killError.message);
						}
					}
				} else if (this.claudeProcess) {
					this.claudeProcess.kill('SIGKILL');
				}

				this.claudeProcess = null;
			} catch (error) {
				this.logger.error(`} Error killing process:`, error);
				this.claudeProcess = null;
			}
		}
	}

	/**
	 * Cleanup on shutdown
	 */
	shutdown(): void {
		this.logger.info(` Shutting down...`);

		// Kill Claude if running
		this.kill();

		// Close Claude WebSocket server
		if (this.claudeWss) {
			this.logger.info(` Closing Claude WebSocket server...`);
			this.claudeWss.close(() => {
				this.logger.info(` Claude WebSocket server closed`);
			});
			this.claudeWss = null;
		}
	}
}
