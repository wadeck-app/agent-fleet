import type { ExecutionStore } from '../storage/ExecutionStore';
import type { LogWriter } from '../storage/LogWriter';
import type { CommandHandler } from './CommandHandler';
import type { DaemonSecrets } from './DaemonSecrets.js';
import type { RelayRegistry } from './RelayRegistry.js';
import type { WebSocketServer } from './WebSocketServer';
import type { WorkerProvisioner } from './WorkerProvisioner.js';
import type { WorkerRegistry } from './WorkerRegistry.js';

/**
 * The collaborators a running daemon is made of, available once its start hook has built them.
 *
 * The IPC commands, the worker-message handler and the idle shutdown are created before the daemon
 * starts, so they receive a getter for this instead of the instances themselves.
 */
export interface DaemonRuntime {
	commandHandler: CommandHandler;
	workerRegistry: WorkerRegistry;
	relayRegistry: RelayRegistry;
	workerProvisioner: WorkerProvisioner;
	wsServer: WebSocketServer;
	executionStore: ExecutionStore;
	logWriter: LogWriter;
	daemonSecrets: DaemonSecrets;
}
