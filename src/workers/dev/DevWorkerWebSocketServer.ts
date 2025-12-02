import { WebSocketServer, WebSocket } from 'ws';
import { ClaudeProcessManager } from './ClaudeProcessManager.js';

/**
 * DevWorkerWebSocketServer
 *
 * Manages WebSocket server for Claude Code processes to communicate with worker including:
 * - Setting up WebSocket server
 * - Handling Claude connections
 * - Processing Claude messages (STOP_REQUESTED, HOOK_EVENT, etc.)
 * - Managing socket lifecycle
 */
export class DevWorkerWebSocketServer {
  private wss: WebSocketServer | null = null;
  private port: number = 0;
  private claudeSocket: WebSocket | null = null;
  private logPrefix: string;
  private processManager: ClaudeProcessManager;

  constructor(processManager: ClaudeProcessManager, logPrefix: string = '[DevWorkerWebSocketServer]') {
    this.processManager = processManager;
    this.logPrefix = logPrefix;
    this.setupWebSocketServer();
  }

  /**
   * Setup WebSocket server for Claude processes to communicate with this worker
   */
  private setupWebSocketServer(): void {
    // Create WebSocket server on a random available port
    this.wss = new WebSocketServer({ port: 0 });

    this.wss.on('listening', () => {
      const address = this.wss!.address();
      if (typeof address === 'object' && address !== null) {
        this.port = address.port;
        console.log(`${this.logPrefix} Claude WebSocket server listening on port ${this.port}`);
      }
    });

    this.wss.on('connection', (socket: WebSocket) => {
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

      socket.on('error', (error) => {
        console.error(`${this.logPrefix} Claude socket error:`, error);
      });
    });

    this.wss.on('error', (error) => {
      console.error(`${this.logPrefix} Claude WebSocket server error:`, error);
    });
  }

  /**
   * Handle messages from Claude processes (via hooks)
   */
  private handleClaudeMessage(message: any): void {
    switch (message.type) {
      case 'STOP_REQUESTED':
        console.log(`${this.logPrefix} Stop requested by Claude, killing process...`);
        this.processManager.killClaude();
        break;

      case 'HOOK_EVENT':
        console.log(`${this.logPrefix} Hook event: ${message.hookName}`);
        break;

      default:
        console.log(`${this.logPrefix} Unknown message type: ${message.type}`);
    }
  }

  /**
   * Get the port the WebSocket server is listening on
   */
  getPort(): number {
    return this.port;
  }

  /**
   * Get the WebSocket server instance
   */
  getServer(): WebSocketServer | null {
    return this.wss;
  }

  /**
   * Get the connected Claude socket
   */
  getSocket(): WebSocket | null {
    return this.claudeSocket;
  }

  /**
   * Close the WebSocket server
   */
  close(): void {
    if (this.wss) {
      console.log(`${this.logPrefix} Closing Claude WebSocket server...`);
      this.wss.close(() => {
        console.log(`${this.logPrefix} Claude WebSocket server closed`);
      });
      this.wss = null;
    }
  }
}
