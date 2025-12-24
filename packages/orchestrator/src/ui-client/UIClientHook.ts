import { EventEmitter } from 'events';
import { logger } from 'shared-common/logger';
import { StateEvent, StateManager } from 'shared-orch-worker/StateManager';

/**
 * UI Client Hook
 *
 * Purpose:
 * - Hook point for future UI client connections
 * - Listens to all StateManager events
 * - Relays events to connected UI clients (future implementation)
 * - Allows plugging in UI connectivity without modifying core orchestrator
 *
 * Architecture:
 * 1. Orchestrator creates and registers this hook
 * 2. Hook subscribes to all StateManager events
 * 3. Future UIConnectionManager will listen to this hook's events
 * 4. Hook relays state changes to UIConnectionManager → UI clients
 *
 * Usage:
 * - enable() to start listening to state events
 * - disable() to stop listening
 * - Emit 'state_update', 'command_result', 'error' events for UI clients
 */
export class UIClientHook extends EventEmitter {
	private stateManager: StateManager;
	private isEnabled: boolean = false;
	private eventSubscriptions: Map<StateEvent, (...args: any[]) => void> = new Map();

	constructor(stateManager: StateManager) {
		super();
		this.stateManager = stateManager;
	}

	/**
	 * Enable the hook and start listening to state events
	 */
	enable(): void {
		if (this.isEnabled) {
			logger.warn('UIClientHook', 'Already enabled, ignoring enable()');
			return;
		}

		// Subscribe to all state events
		Object.values(StateEvent).forEach(event => {
			const handler = (data: any) => this.onStateEvent(event, data);
			this.eventSubscriptions.set(event, handler);
			this.stateManager.on(event, handler);
		});

		this.isEnabled = true;

		logger.info('UIClientHook', `Enabled and listening to ${Object.values(StateEvent).length} state events`);
	}

	/**
	 * Disable the hook and stop listening to state events
	 */
	disable(): void {
		if (!this.isEnabled) {
			return;
		}

		// Unsubscribe from all state events
		this.eventSubscriptions.forEach((handler, event) => {
			this.stateManager.removeListener(event, handler);
		});

		this.eventSubscriptions.clear();
		this.isEnabled = false;

		logger.info('UIClientHook', 'Disabled');
	}

	/**
	 * Handle state event from StateManager
	 * Relay to connected UI clients (via events)
	 */
	protected onStateEvent(event: StateEvent, data: any): void {
		if (!this.isEnabled) {
			return;
		}

		// Emit to any UI clients listening to this hook
		// Future UIConnectionManager will listen to these events
		this.emit('state_update', {
			event,
			data,
			timestamp: new Date().toISOString(),
		});

		logger.debug('UIClientHook', `State event relayed: ${event}`, { event });
	}

	/**
	 * Send a command result back to UI
	 * Called by orchestrator when a UI command is executed
	 */
	sendCommandResult(requestId: string, success: boolean, data?: any, error?: string): void {
		if (!this.isEnabled) {
			return;
		}

		this.emit('command_result', {
			requestId,
			success,
			data,
			error,
			timestamp: new Date().toISOString(),
		});

		logger.debug('UIClientHook', `Command result sent: ${requestId} (${success ? 'success' : 'error'})`, {
			requestId,
			success,
		});
	}

	/**
	 * Broadcast an error to all connected UIs
	 */
	broadcastError(error: string, details?: any): void {
		if (!this.isEnabled) {
			return;
		}

		this.emit('error', {
			error,
			details,
			timestamp: new Date().toISOString(),
		});

		logger.error('UIClientHook', `Error broadcasted: ${error}`, { error });
	}

	/**
	 * Send a snapshot to a UI client
	 * Called when a UI requests full state
	 */
	sendSnapshot(snapshot: any, requestId?: string): void {
		if (!this.isEnabled) {
			return;
		}

		this.emit('snapshot', {
			snapshot,
			requestId,
			timestamp: new Date().toISOString(),
		});

		logger.debug('UIClientHook', 'Snapshot sent', { requestId });
	}

	/**
	 * Check if hook is enabled
	 */
	isActive(): boolean {
		return this.isEnabled;
	}

	/**
	 * Get number of listeners (UI clients connected)
	 * Useful for debugging
	 */
	getListenerCount(): number {
		return this.listenerCount('state_update');
	}
}
