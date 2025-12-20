import { WebSocketServer, WebSocket } from 'ws';
import {
  WorkerInfo,
  MessageType
} from 'shared-common/types.js';
import { createMessage, parseMessage } from 'shared-common/protocol.js';
import { TaskManager } from '../core/TaskManager.js';
import { StateManager } from 'shared-common/StateManager.js';
import { Logger } from 'shared-common/Logger.js';
import { WebSocketConnectionManager } from './WebSocketConnectionManager.js';
import { WebSocketEventHandler } from './WebSocketEventHandler.js';
import { WebSocketMessageRouter } from './WebSocketMessageRouter.js';

/**
 * Main WebSocket server that coordinates worker connections and message routing
 * Responsibilities:
 * - Setup and manage WebSocket server
 * - Coordinate specialized components
 * - Handle connection lifecycle
 */
export class WorkerWebSocketServer {
  private wss: WebSocketServer;
  private port: number;
  private connectionManager: WebSocketConnectionManager;
  private eventHandler: WebSocketEventHandler;
  private messageRouter: WebSocketMessageRouter;

  constructor(taskManager: TaskManager, stateManager: StateManager, port: number = 3738) {
    this.port = port;

    // Initialize components
    this.connectionManager = new WebSocketConnectionManager(taskManager, stateManager);
    this.eventHandler = new WebSocketEventHandler(taskManager, stateManager, this.connectionManager);
    this.messageRouter = new WebSocketMessageRouter(this.connectionManager, this.eventHandler);

    // Setup WebSocket server
    this.wss = new WebSocketServer({ port: this.port });
    this.setupServer();
  }

  private setupServer(): void {
    this.wss.on('connection', (socket: WebSocket) => {
      Logger.debug('[WS] New worker connection');
      this.handleConnection(socket);
    });

    this.wss.on('error', (error) => {
      Logger.error('[WS] Server error:', error);
    });

    Logger.debug(`[WS] WebSocket server listening on port ${this.port}`);
  }

  private handleConnection(socket: WebSocket): void {
    let workerId: string | null = null;

    socket.on('message', (data: Buffer) => {
      try {
        const message = parseMessage(data.toString());

        const result = this.messageRouter.routeMessage(socket, message, workerId);
        // If routeMessage returns a workerId, update it
        if (result && typeof result === 'string') {
          workerId = result;
        }
      } catch (error) {
        Logger.error('[WS] Error parsing message:', (error as Error).message);
        this.connectionManager.sendMessage(socket, createMessage(MessageType.ERROR, {
          error: (error as Error).message
        }));
      }
    });

    socket.on('close', () => {
      if (workerId) {
        this.connectionManager.handleWorkerDisconnect(workerId);
      }
    });

    socket.on('error', (error) => {
      Logger.error('[WS] Socket error:', error);
    });
  }

  /**
   * Get all workers
   */
  getWorkers(): WorkerInfo[] {
    return this.connectionManager.getWorkers();
  }

  /**
   * Try to assign tasks to idle workers
   */
  tryAssignTasksToIdleWorkers(): void {
    this.connectionManager.tryAssignTasksToIdleWorkers();
  }

  getPort(): number {
    return this.port;
  }

  /**
   * Get the connection manager
   */
  getConnectionManager(): WebSocketConnectionManager {
    return this.connectionManager;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all worker connections
      this.connectionManager.closeAll();

      this.wss.close(() => {
        Logger.debug('[WS] WebSocket server stopped');
        resolve();
      });
    });
  }
}
