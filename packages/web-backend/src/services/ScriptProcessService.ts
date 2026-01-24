import { createLogger } from 'shared-common/logger';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { ScriptLogEntry, ScriptProcess, WorkspaceScript } from '@app/shared/api/workspaceScripts.contract';
import {
	B2F_SCRIPT_PROCESS_ERROR,
	B2F_SCRIPT_PROCESS_LOG_UPDATED,
	B2F_SCRIPT_PROCESS_STARTED,
	B2F_SCRIPT_PROCESS_STOPPED,
} from '@app/shared/transport';

import type { ScriptProcessRepository } from '../repositories/ScriptProcessRepository';
import type { WorkspaceScriptsRepository } from '../repositories/WorkspaceScriptsRepository';
import type { ScriptLogsStorage } from '../storage/ScriptLogsStorage';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import type { ScriptProcessManager } from './ScriptProcessManager';
import type { WorkspacesService } from './WorkspacesService';

const log = createLogger('ScriptProcessService');

/**
 * ===========================================================================================
 * SCRIPT PROCESS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for script process lifecycle management.
 *
 * Responsibilities:
 * - Start/stop/restart script processes
 * - Track process status and PID
 * - Store and retrieve logs
 * - Cleanup orphaned processes
 * - Emit B2F events for process state changes
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Low-level process management (in ScriptProcessManager)
 * - Data storage (in repositories/storage)
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 * - Type-safe event emission using EventBroadcaster
 * - Log updates use scriptId filter for targeted delivery
 *
 * Process Lifecycle:
 * 1. startProcess() → create process record → spawn process → emit B2F_SCRIPT_PROCESS_STARTED
 * 2. Process running → logs stored incrementally → emit B2F_SCRIPT_PROCESS_LOG_UPDATED
 * 3. stopProcess() → kill process → update status → emit B2F_SCRIPT_PROCESS_STOPPED
 * 4. Process crash → mark as crashed → emit B2F_SCRIPT_PROCESS_ERROR
 *
 * ===========================================================================================
 */
export class ScriptProcessService {
	constructor(
		private readonly workspaceScriptsRepository: WorkspaceScriptsRepository,
		private readonly scriptProcessRepository: ScriptProcessRepository,
		private readonly scriptLogsStorage: ScriptLogsStorage,
		private readonly scriptProcessManager: ScriptProcessManager,
		private readonly workspacesService: WorkspacesService,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

	/**
	 * Start a script process
	 */
	async startProcess(workspaceId: string, scriptId: string): Promise<ScriptProcess> {
		try {
			log.info(`Starting process for script ${scriptId}`);

			// Get script configuration
			const script = await this.workspaceScriptsRepository.findById(scriptId);
			if (!script || script.workspaceId !== workspaceId) {
				throw new Error(`Script ${scriptId} not found in workspace ${workspaceId}`);
			}

			if (!script.enabled) {
				throw new Error(`Script ${scriptId} is disabled`);
			}

			// Check if already running
			const existingProcess = await this.scriptProcessRepository.findByScriptId(scriptId);
			if (existingProcess && existingProcess.status === 'running') {
				throw new Error(`Script ${scriptId} is already running`);
			}

			// Get workspace to find path
			const workspacesData = await this.workspacesService.getWorkspacesData();
			const workspace = workspacesData.workspaces.find(w => w.id === workspaceId);
			if (!workspace) {
				throw new Error(`Workspace ${workspaceId} not found`);
			}

			// Create process record
			const process = await this.scriptProcessRepository.create({
				workspaceScriptId: scriptId,
				status: 'starting',
				restartCount: 0,
			});

			// Start process via ScriptProcessManager
			try {
				const childProcess = await this.scriptProcessManager.startScript(
					scriptId,
					script.scriptName,
					workspace.path,
					// onLog callback - store logs and emit events
					(logEntry: ScriptLogEntry) => {
						this.handleLogEntry(scriptId, logEntry).catch(error => {
							log.error(`Failed to handle log entry for script ${scriptId}:`, error);
						});
					},
					// onExit callback - handle process exit
					(exitCode: number | null, signal: NodeJS.Signals | null) => {
						this.handleProcessExit(script, process.id, exitCode, signal).catch(error => {
							log.error(`Failed to handle process exit for script ${scriptId}:`, error);
						});
					}
				);

				// Update process with PID and running status
				const pid = childProcess.pid;
				if (!pid) {
					throw new Error('Failed to get process PID');
				}

				const updatedProcess = await this.scriptProcessRepository.updateStatus(process.id, 'running');
				await this.scriptProcessRepository.updatePid(process.id, pid);

				// Emit event after successful start
				try {
					this.eventBroadcaster.broadcast(B2F_SCRIPT_PROCESS_STARTED, updatedProcess);
				} catch (error) {
					log.error('Failed to broadcast process started event:', error);
				}

				log.info(`Started process ${process.id} for script ${scriptId} (PID: ${pid})`);
				return { ...updatedProcess, pid };
			} catch (error) {
				// Failed to start - update status to error
				const errorMessage = getErrorMessage(error);
				await this.scriptProcessRepository.updateStatus(process.id, 'error', errorMessage);

				// Emit error event
				try {
					this.eventBroadcaster.broadcast(B2F_SCRIPT_PROCESS_ERROR, {
						scriptId,
						processId: process.id,
						error: errorMessage,
					});
				} catch (broadcastError) {
					log.error('Failed to broadcast process error event:', broadcastError);
				}

				throw error;
			}
		} catch (error) {
			log.error(`Failed to start process for script ${scriptId}:`, error);
			throw error;
		}
	}

	/**
	 * Stop a script process
	 */
	async stopProcess(workspaceId: string, scriptId: string): Promise<ScriptProcess> {
		try {
			log.info(`Stopping process for script ${scriptId}`);

			// Get script configuration
			const script = await this.workspaceScriptsRepository.findById(scriptId);
			if (!script || script.workspaceId !== workspaceId) {
				throw new Error(`Script ${scriptId} not found in workspace ${workspaceId}`);
			}

			// Get process
			const process = await this.scriptProcessRepository.findByScriptId(scriptId);
			if (!process) {
				throw new Error(`No process found for script ${scriptId}`);
			}

			if (process.status !== 'running') {
				throw new Error(`Process for script ${scriptId} is not running (status: ${process.status})`);
			}

			// Update status to stopping
			await this.scriptProcessRepository.updateStatus(process.id, 'stopping');

			// Stop process via ScriptProcessManager
			try {
				await this.scriptProcessManager.stopScript(scriptId);

				// Update status to stopped
				const updatedProcess = await this.scriptProcessRepository.markStopped(process.id, 0);

				// Emit event after successful stop
				try {
					this.eventBroadcaster.broadcast(B2F_SCRIPT_PROCESS_STOPPED, updatedProcess);
				} catch (error) {
					log.error('Failed to broadcast process stopped event:', error);
				}

				log.info(`Stopped process ${process.id} for script ${scriptId}`);
				return updatedProcess;
			} catch (error) {
				// Failed to stop - update status to error
				const errorMessage = getErrorMessage(error);
				await this.scriptProcessRepository.updateStatus(process.id, 'error', errorMessage);

				throw error;
			}
		} catch (error) {
			log.error(`Failed to stop process for script ${scriptId}:`, error);
			throw error;
		}
	}

	/**
	 * Restart a script process
	 */
	async restartProcess(workspaceId: string, scriptId: string): Promise<ScriptProcess> {
		try {
			log.info(`Restarting process for script ${scriptId}`);

			// Get script configuration
			const script = await this.workspaceScriptsRepository.findById(scriptId);
			if (!script || script.workspaceId !== workspaceId) {
				throw new Error(`Script ${scriptId} not found in workspace ${workspaceId}`);
			}

			// Get existing process
			const existingProcess = await this.scriptProcessRepository.findByScriptId(scriptId);

			// Stop if running
			if (existingProcess && existingProcess.status === 'running') {
				try {
					await this.stopProcess(workspaceId, scriptId);
				} catch (error) {
					log.warn(`Failed to stop process before restart: ${getErrorMessage(error)}`);
				}
			}

			// Increment restart count if process exists
			if (existingProcess) {
				await this.scriptProcessRepository.incrementRestartCount(existingProcess.id);
			}

			// Start process
			return await this.startProcess(workspaceId, scriptId);
		} catch (error) {
			log.error(`Failed to restart process for script ${scriptId}:`, error);
			throw error;
		}
	}

	/**
	 * Handle log entry from process
	 */
	private async handleLogEntry(scriptId: string, logEntry: ScriptLogEntry): Promise<void> {
		try {
			// Store log incrementally
			await this.scriptLogsStorage.writeLogsIncremental(scriptId, [logEntry]);

			// Emit log updated event with scriptId filter
			try {
				this.eventBroadcaster.broadcast(B2F_SCRIPT_PROCESS_LOG_UPDATED, {
					scriptId,
					logs: [logEntry],
				});
			} catch (error) {
				log.error('Failed to broadcast log updated event:', error);
			}
		} catch (error) {
			log.error(`Failed to handle log entry for script ${scriptId}:`, error);
		}
	}

	/**
	 * Handle process exit
	 */
	private async handleProcessExit(
		script: WorkspaceScript,
		processId: string,
		exitCode: number | null,
		signal: NodeJS.Signals | null
	): Promise<void> {
		try {
			log.info(`Process ${processId} exited with code ${exitCode}, signal ${signal}`);

			const crashed = exitCode !== 0 && exitCode !== null;

			// Update process status
			if (crashed) {
				const errorMessage = `Process exited with code ${exitCode}${signal ? `, signal ${signal}` : ''}`;
				await this.scriptProcessRepository.markCrashed(processId, errorMessage, exitCode ?? undefined);

				// Emit error event
				try {
					this.eventBroadcaster.broadcast(B2F_SCRIPT_PROCESS_ERROR, {
						scriptId: script.id,
						processId,
						error: errorMessage,
					});
				} catch (error) {
					log.error('Failed to broadcast process error event:', error);
				}
			} else {
				await this.scriptProcessRepository.markStopped(processId, exitCode ?? 0);

				// Emit stopped event
				try {
					const process = await this.scriptProcessRepository.findById(processId);
					if (process) {
						this.eventBroadcaster.broadcast(B2F_SCRIPT_PROCESS_STOPPED, process);
					}
				} catch (error) {
					log.error('Failed to broadcast process stopped event:', error);
				}
			}
		} catch (error) {
			log.error(`Failed to handle process exit for process ${processId}:`, error);
		}
	}

	/**
	 * Check for orphaned processes on startup and cleanup
	 */
	async checkOrphanedProcesses(): Promise<void> {
		try {
			log.info('Checking for orphaned processes...');

			// Get all processes marked as running
			const runningProcesses = await this.scriptProcessRepository.findRunning();

			for (const process of runningProcesses) {
				// Check if process is actually running via ScriptProcessManager
				const isRunning = this.scriptProcessManager.isRunning(process.workspaceScriptId);

				if (!isRunning) {
					log.warn(`Orphaned process detected: ${process.id}, marking as crashed`);
					await this.scriptProcessRepository.markCrashed(
						process.id,
						'Process was orphaned (server restart)',
						undefined
					);

					// Emit error event
					try {
						this.eventBroadcaster.broadcast(B2F_SCRIPT_PROCESS_ERROR, {
							scriptId: process.workspaceScriptId,
							processId: process.id,
							error: 'Process was orphaned (server restart)',
						});
					} catch (error) {
						log.error('Failed to broadcast process error event:', error);
					}
				}
			}

			log.info('Orphaned process check complete');
		} catch (error) {
			log.error('Failed to check orphaned processes:', error);
		}
	}

	/**
	 * Cleanup all processes (called on server shutdown)
	 */
	async cleanupAllProcesses(): Promise<void> {
		try {
			log.info('Cleaning up all script processes...');
			await this.scriptProcessManager.cleanupAllProcesses();
			log.info('Script process cleanup complete');
		} catch (error) {
			log.error('Failed to cleanup script processes:', error);
		}
	}

	/**
	 * Get process status for a script
	 */
	async getProcessStatus(workspaceId: string, scriptId: string): Promise<ScriptProcess | null> {
		try {
			// Verify script belongs to workspace
			const script = await this.workspaceScriptsRepository.findById(scriptId);
			if (!script || script.workspaceId !== workspaceId) {
				return null;
			}

			return await this.scriptProcessRepository.findByScriptId(scriptId);
		} catch (error) {
			log.error(`Failed to get process status for script ${scriptId}:`, error);
			throw error;
		}
	}
}
