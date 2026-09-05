import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createLogger } from 'shared-common/logger';

import type { ScriptLogEntry } from '@app/shared/api/workspaceScripts.contract';

const log = createLogger('ScriptProcessManager');

/**
 * Process info tracked by the manager
 */
interface ProcessInfo {
	process: ChildProcess;
	scriptId: string;
	workingDir: string;
	onLog?: (entry: ScriptLogEntry) => void;
	onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void;
}

/**
 * ===========================================================================================
 * SCRIPT PROCESS MANAGER
 * ===========================================================================================
 *
 * Manages script process lifecycle using child_process.spawn().
 * Cross-platform support for Windows and Unix systems.
 *
 * Features:
 * - Process spawning with npm run <scriptName>
 * - Real-time log streaming (stdout/stderr)
 * - Graceful shutdown with SIGTERM/SIGKILL
 * - Cross-platform process killing (taskkill on Windows, kill on Unix)
 * - Process tracking with PIDs
 * - Automatic cleanup on server shutdown
 *
 * Windows Handling:
 * - Uses cmd.exe /c for script execution
 * - Uses taskkill /F /T /PID for process termination (kills child processes too)
 *
 * Unix Handling:
 * - Uses sh -c for script execution
 * - Uses kill -SIGTERM/SIGKILL for process termination
 *
 * ===========================================================================================
 */
export class ScriptProcessManager {
	private processes: Map<string, ProcessInfo> = new Map();
	private isShuttingDown = false;

	/**
	 * Start a script process
	 * @param scriptId - Unique script ID
	 * @param scriptName - Script name from package.json (e.g., "dev:backend")
	 * @param workingDir - Working directory (workspace path)
	 * @param onLog - Callback for log entries
	 * @param onExit - Callback when process exits
	 * @returns Child process
	 */
	async startScript(
		scriptId: string,
		scriptName: string,
		workingDir: string,
		onLog?: (entry: ScriptLogEntry) => void,
		onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void
	): Promise<ChildProcess> {
		if (this.isShuttingDown) {
			throw new Error('Cannot start process during shutdown');
		}

		// Check if already running
		if (this.processes.has(scriptId)) {
			throw new Error(`Script ${scriptId} is already running`);
		}

		log.info(`[ScriptProcessManager] Starting script: ${scriptName} in ${workingDir}`);

		// Verify working directory exists
		if (!fs.existsSync(workingDir)) {
			throw new Error(`Working directory does not exist: ${workingDir}`);
		}

		// Verify package.json exists
		const packageJsonPath = path.join(workingDir, 'package.json');
		if (!fs.existsSync(packageJsonPath)) {
			throw new Error(`package.json not found in: ${workingDir}`);
		}

		// Build command: npm run <scriptName>
		const isWindows = process.platform === 'win32';
		const command = isWindows ? 'cmd.exe' : 'sh';
		const args = isWindows ? ['/c', 'npm', 'run', scriptName] : ['-c', `npm run ${scriptName}`];

		// Spawn process
		const childProcess = spawn(command, args, {
			cwd: workingDir,
			env: { ...process.env },
			// Don't use shell: true because we're already using cmd.exe or sh
			shell: false,
		});

		// Track process
		const processInfo: ProcessInfo = {
			process: childProcess,
			scriptId,
			workingDir,
			onLog,
			onExit,
		};
		this.processes.set(scriptId, processInfo);

		// Handle stdout
		childProcess.stdout?.on('data', (data: Buffer) => {
			const message = data.toString();
			const logEntry: ScriptLogEntry = {
				id: this.generateLogId(),
				timestamp: Date.now(),
				level: 'stdout',
				message,
			};

			log.debug(`[ScriptProcessManager] [${scriptId}] stdout: ${message.substring(0, 100)}`);

			if (onLog) {
				onLog(logEntry);
			}
		});

		// Handle stderr
		childProcess.stderr?.on('data', (data: Buffer) => {
			const message = data.toString();
			const logEntry: ScriptLogEntry = {
				id: this.generateLogId(),
				timestamp: Date.now(),
				level: 'stderr',
				message,
			};

			log.debug(`[ScriptProcessManager] [${scriptId}] stderr: ${message.substring(0, 100)}`);

			if (onLog) {
				onLog(logEntry);
			}
		});

		// Handle exit
		childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
			log.info(`[ScriptProcessManager] Process ${scriptId} exited with code ${code}, signal ${signal}`);

			this.processes.delete(scriptId);

			if (onExit) {
				onExit(code, signal);
			}
		});

		// Handle errors
		childProcess.on('error', (err: Error) => {
			log.error(`[ScriptProcessManager] Process ${scriptId} error:`, err);

			const logEntry: ScriptLogEntry = {
				id: this.generateLogId(),
				timestamp: Date.now(),
				level: 'error',
				message: `Process error: ${(err instanceof Error ? err.message : String(err))}`,
			};

			if (onLog) {
				onLog(logEntry);
			}

			this.processes.delete(scriptId);
		});

		return childProcess;
	}

	/**
	 * Stop a script process
	 * @param scriptId - Script ID
	 * @param signal - Signal to send (default: SIGTERM)
	 */
	async stopScript(scriptId: string, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
		const processInfo = this.processes.get(scriptId);

		if (!processInfo) {
			log.warn(`[ScriptProcessManager] Script ${scriptId} is not running`);
			return;
		}

		const { process: childProcess } = processInfo;
		const pid = childProcess.pid;

		if (!pid) {
			log.warn(`[ScriptProcessManager] Script ${scriptId} has no PID`);
			this.processes.delete(scriptId);
			return;
		}

		log.info(`[ScriptProcessManager] Stopping script ${scriptId} (PID: ${pid}) with signal ${signal}`);

		const isWindows = process.platform === 'win32';

		if (isWindows) {
			// On Windows, use taskkill to kill process tree
			// /F = force, /T = kill child processes, /PID = process ID
			try {
				await this.execCommand(`taskkill /F /T /PID ${pid}`);
			} catch (error) {
				log.error(`[ScriptProcessManager] Failed to kill process ${pid}:`, error);
				throw error;
			}
		} else {
			// On Unix, send signal
			try {
				childProcess.kill(signal);

				// If SIGTERM, wait 5s then send SIGKILL if still running
				if (signal === 'SIGTERM') {
					setTimeout(() => {
						if (this.processes.has(scriptId)) {
							log.warn(`[ScriptProcessManager] Process ${scriptId} did not stop, sending SIGKILL`);
							childProcess.kill('SIGKILL');
						}
					}, 5000);
				}
			} catch (error) {
				log.error(`[ScriptProcessManager] Failed to kill process ${pid}:`, error);
				throw error;
			}
		}

		// Remove from tracking
		this.processes.delete(scriptId);
	}

	/**
	 * Restart a script process
	 * @param scriptId - Script ID
	 * @param scriptName - Script name
	 * @param workingDir - Working directory
	 * @param onLog - Log callback
	 * @param onExit - Exit callback
	 */
	async restartScript(
		scriptId: string,
		scriptName: string,
		workingDir: string,
		onLog?: (entry: ScriptLogEntry) => void,
		onExit?: (exitCode: number | null, signal: NodeJS.Signals | null) => void
	): Promise<ChildProcess> {
		log.info(`[ScriptProcessManager] Restarting script ${scriptId}`);

		// Stop if running
		if (this.processes.has(scriptId)) {
			await this.stopScript(scriptId);

			// Wait for process to actually stop
			await this.waitForProcessStop(scriptId, 10000);
		}

		// Start again
		return this.startScript(scriptId, scriptName, workingDir, onLog, onExit);
	}

	/**
	 * Get process status
	 * @param scriptId - Script ID
	 * @returns True if running
	 */
	isRunning(scriptId: string): boolean {
		return this.processes.has(scriptId);
	}

	/**
	 * Get process PID
	 * @param scriptId - Script ID
	 * @returns PID or undefined
	 */
	getPid(scriptId: string): number | undefined {
		const processInfo = this.processes.get(scriptId);
		return processInfo?.process.pid;
	}

	/**
	 * Get all running script IDs
	 */
	getRunningScriptIds(): string[] {
		return Array.from(this.processes.keys());
	}

	/**
	 * Cleanup all processes (called on server shutdown)
	 */
	async cleanupAllProcesses(): Promise<void> {
		this.isShuttingDown = true;

		log.info(`[ScriptProcessManager] Cleaning up ${this.processes.size} processes`);

		const scriptIds = Array.from(this.processes.keys());

		for (const scriptId of scriptIds) {
			try {
				await this.stopScript(scriptId, 'SIGTERM');
			} catch (error) {
				log.error(`[ScriptProcessManager] Failed to stop script ${scriptId}:`, error);
			}
		}

		log.info(`[ScriptProcessManager] Cleanup complete`);
	}

	/**
	 * Wait for a process to stop
	 */
	private async waitForProcessStop(scriptId: string, timeoutMs: number): Promise<void> {
		const startTime = Date.now();

		while (this.processes.has(scriptId)) {
			if (Date.now() - startTime > timeoutMs) {
				throw new Error(`Timeout waiting for process ${scriptId} to stop`);
			}

			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}

	/**
	 * Execute a command (for Windows taskkill)
	 */
	private async execCommand(command: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const childProcess = spawn(command, {
				shell: true,
			});

			childProcess.on('exit', code => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Command failed with exit code ${code}`));
				}
			});

			childProcess.on('error', err => {
				reject(err);
			});
		});
	}

	/**
	 * Generate unique log entry ID
	 */
	private generateLogId(): string {
		return `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}
}
