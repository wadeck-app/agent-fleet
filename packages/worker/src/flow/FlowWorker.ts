/**
 * Flow Worker (Refactored)
 *
 * Executes flows defined in the Flow Engine via FlowExecutor.
 * Integrates WorkspaceManager, FlowRegistry, and FlowExecutor with the orchestrator.
 *
 * This class handles:
 * - WebSocket communication with orchestrator
 * - Task assignment and execution coordination
 * - Flow execution orchestration
 */
import type { ChildProcess } from 'child_process';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { type FlowExecutionOptions, FlowExecutor } from 'flow-engine/executor/FlowExecutor';
import { FlowRegistry } from 'flow-engine/registry/FlowRegistry';
import type { FlowMetadata, Workspace } from 'flow-engine/types';
import { WorkspaceManager } from 'flow-engine/workspace/WorkspaceManager';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join, resolve } from 'path';
import * as path from 'path';
import { getOrchestratorWsUrl } from 'shared-common/PortCalculator';
import type { Shutdownable } from 'shared-common/Shutdownable';
import { parseMessage, serializeMessage } from 'shared-common/protocol';
import { type Task, TaskStatus } from 'shared-orch-worker/domain-types';
import {
	type AssignTaskMessage,
	type ErrorMessage,
	type KillClaudeMessage,
	type O2WMessage,
	O2WMessageType,
	type WorkerWelcomeMessage,
} from 'shared-orch-worker/orchestrator-messages';
import { type W2OMessage, W2OMessageType, createW2OMessage } from 'shared-orch-worker/worker-messages';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

import { ClaudeLifecycleManager } from './ClaudeLifecycleManager';

// import { FlowExecutionMonitor } from './FlowExecutionMonitor';

/**
 * Flow Worker class (Refactored)
 */
export class FlowWorker implements Shutdownable {
	// Worker identity
	protected workerId: string;
	protected preferredWorkerId?: string;

	// WebSocket connection to orchestrator
	protected ws: WebSocket | null = null;
	protected wsUrl: string;
	protected reconnectDelay = 1000; // Start at 1 second
	protected maxReconnectDelay = 30000; // Max 30 seconds
	protected reconnectionAttempts = 0;
	protected heartbeatInterval = 30000;
	private heartbeatTimer: NodeJS.Timeout | null = null;

	// Task management
	protected currentTask: Task | null = null;

	// Flow engine components
	private flowRegistry: FlowRegistry;
	private flowExecutor: FlowExecutor;
	private workspaceManager: WorkspaceManager;
	private interactive: boolean;
	private projectRoot: string;
	private projectId: string = '';

	// Specialized managers (extracted from god class)
	private claudeProcessManager: ClaudeLifecycleManager;
	// private flowExecutionMonitor: FlowExecutionMonitor;

	/**
	 * Initialize the Flow Worker
	 * @param wsUrl - WebSocket URL for orchestrator connection (defaults to localhost)
	 * @param projectRoot - Project root directory (can be set via CLI flag --project-root=<path> or env var PROJECT_ROOT, defaults to process.cwd())
	 * @param interactive - Enable interactive mode for code execution
	 * @param preferredWorkerId - Preferred worker ID (can be set via CLI flag --worker-id=<id> or env var WORKER_ID)
	 * @param enableUI - Enable terminal UI (defaults to true, can be disabled via --no-ui flag)
	 */
	constructor(
		wsUrl?: string,
		projectRoot: string = process.cwd(),
		interactive: boolean = false,
		preferredWorkerId?: string,
		enableUI: boolean = true
	) {
		// Worker identity
		this.workerId = '?'; // Will be assigned by orchestrator during Welcome
		this.wsUrl = wsUrl || getOrchestratorWsUrl('localhost', '/ws');
		this.preferredWorkerId = preferredWorkerId;

		this.interactive = interactive;
		this.projectRoot = projectRoot;
		console.log(`[FlowWorker] Initializing with project root: ${projectRoot}`);
		if (interactive) console.log(`[FlowWorker] Interactive mode enabled`);
		if (preferredWorkerId) console.log(`[FlowWorker] Preferred worker ID: ${preferredWorkerId}`);
		if (enableUI) console.log(`[FlowWorker] UI enabled`);

		// Initialize specialized managers
		this.claudeProcessManager = new ClaudeLifecycleManager(this.logPrefix());
		// this.flowExecutionMonitor = new FlowExecutionMonitor();

		// Setup Claude message handler
		this.claudeProcessManager.setMessageHandler(message => {
			this.handleClaudeMessage(message);
		});

		// Initialize Flow Engine components
		this.flowRegistry = new FlowRegistry(projectRoot);
		this.flowExecutor = new FlowExecutor(interactive, this.flowRegistry);
		this.workspaceManager = new WorkspaceManager(projectRoot);

		// Load project flows
		this.loadFlows();
	}

	/**
	 * Connect to the orchestrator
	 */
	async connect(): Promise<void> {
		process.title = 'Worker X';

		return new Promise((resolve, reject) => {
			console.log(`${this.logPrefix()} Connecting to ${this.wsUrl}...`);

			this.ws = new WebSocket(this.wsUrl);

			this.ws.on('open', () => {
				console.log(`${this.logPrefix()} Connected`);

				// Reset reconnection attempts on successful connection
				this.reconnectionAttempts = 0;

				this.sendWorkerReady();
				this.startHeartbeat();

				resolve();
			});

			this.ws.on('message', (data: Buffer) => {
				try {
					const message = parseMessage(data.toString()) as O2WMessage;
					this.handleMessage(message);
				} catch (error) {
					console.error(`${this.logPrefix()} Error parsing message:`, (error as Error).message);
				}
			});

			this.ws.on('close', () => {
				console.log(`${this.logPrefix()} Disconnected`);
				this.stopHeartbeat();
				this.scheduleReconnect();
			});

			this.ws.on('error', error => {
				console.error(`${this.logPrefix()} WebSocket error: ${this.formatConnectionError(error)}`);
				reject(error);
			});
		});
	}

	/**
	 * Detect project ID from package.json or git remote origin
	 * @throws Error if neither package.json nor git remote can be detected
	 */
	private detectProjectId(): string {
		// Try to read package.json name
		try {
			const packageJsonPath = join(this.projectRoot, 'package.json');
			const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
			if (packageJson.name) {
				console.log(`${this.logPrefix()} Detected project ID from package.json: ${packageJson.name}`);
				return packageJson.name;
			}
		} catch (error) {
			// package.json not found or doesn't have name, try git
		}

		// Try to get git remote origin
		try {
			const gitRemote = this.detectGitRemoteSync();
			if (gitRemote) {
				console.log(`${this.logPrefix()} Detected project ID from git remote: ${gitRemote}`);
				return gitRemote;
			}
		} catch (error) {
			// git command failed
		}

		throw new Error(
			'Cannot detect project ID: neither package.json name nor git remote origin found. ' +
				'Please ensure your project has a package.json with a "name" field or is a git repository with a remote.'
		);
	}

	/**
	 * Synchronously detect git remote origin
	 * Returns the remote name (e.g., "owner/repo" from "https://github.com/owner/repo.git")
	 */
	private detectGitRemoteSync(): string | null {
		try {
			const remoteUrl = execSync('git remote get-url origin', {
				cwd: this.projectRoot,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
			}).trim();

			// Extract repository name from URL
			// Handles both HTTPS and SSH formats
			const match = remoteUrl.match(/[/:]([^/:]+\/[^/.]+)(\.git)?$/);
			if (match) {
				return match[1]; // Returns "owner/repo"
			}

			return null;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Synchronously detect current git branch
	 * Returns the branch name or null if not in a git repository
	 */
	private detectGitBranchSync(): string | null {
		try {
			console.log(`${this.logPrefix()} Detecting git branch in: ${this.projectRoot}`);
			const branch = execSync('git branch --show-current', {
				cwd: this.projectRoot,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
			}).trim();

			console.log(`${this.logPrefix()} Git command result: "${branch}" (length: ${branch.length})`);
			return branch || null;
		} catch (error) {
			// Not in a git repository or git command failed
			console.error(`${this.logPrefix()} Git detection failed:`, (error as Error).message);
			return null;
		}
	}

	/**
	 * Send WORKER_READY message with project info and available flows
	 */
	private sendWorkerReady(): void {
		this.projectId = this.detectProjectId();
		const workspacePath = this.projectRoot;
		const availableFlows = this.buildFlowMetadata();
		const gitBranch = this.detectGitBranchSync();

		console.log(`${this.logPrefix()} Detected git branch: ${gitBranch || 'null'} for workspace: ${workspacePath}`);

		this.sendMessage(
			createW2OMessage(W2OMessageType.WORKER_READY, {
				preferredId: this.preferredWorkerId,
				projectId: this.projectId,
				workspacePath,
				availableFlows,
				gitBranch: gitBranch || undefined, // Only send if detected
			})
		);
	}

	/**
	 * Start heartbeat to keep connection alive
	 */
	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			this.sendMessage(
				createW2OMessage(W2OMessageType.WORKER_HEARTBEAT, {
					workerId: this.workerId,
				})
			);
		}, this.heartbeatInterval);
	}

	/**
	 * Stop heartbeat
	 */
	private stopHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	/**
	 * Schedule reconnection with exponential backoff (up to 30s)
	 */
	private scheduleReconnect(): void {
		this.reconnectionAttempts++;
		const delay = Math.min(
			this.reconnectDelay * Math.pow(2, this.reconnectionAttempts - 1),
			this.maxReconnectDelay
		);

		console.log(`${this.logPrefix()} Reconnecting in ${delay}ms... (attempt ${this.reconnectionAttempts})`);

		setTimeout(() => {
			this.connect().catch(error => {
				console.error(`${this.logPrefix()} Reconnection failed: ${this.formatConnectionError(error)}`);
				// Will retry via the 'close' event handler
			});
		}, delay);
	}

	/**
	 * Handle incoming message from orchestrator
	 */
	private handleMessage(message: O2WMessage): void {
		switch (message.type) {
			case O2WMessageType.ACK:
				// Acknowledgment received
				break;

			case O2WMessageType.WORKER_WELCOME:
				this.handleWelcome(message as WorkerWelcomeMessage);
				break;

			case O2WMessageType.ASSIGN_TASK:
				this.handleAssignTask(message as AssignTaskMessage);
				break;

			case O2WMessageType.KILL_CLAUDE:
				this.handleKillClaude(message as KillClaudeMessage);
				break;

			case O2WMessageType.PAUSE:
				console.log(`${this.logPrefix()} Received PAUSE`);
				// TODO: Implement pause logic
				break;

			case O2WMessageType.RESUME:
				console.log(`${this.logPrefix()} Received RESUME`);
				// TODO: Implement resume logic
				break;

			case O2WMessageType.SHUTDOWN:
				console.log(`${this.logPrefix()} Received SHUTDOWN`);
				this.shutdown();
				break;

			case O2WMessageType.REQUEST_FLOW_DEFINITION:
				this.handleRequestFlowDefinition(message as any);
				break;

			case O2WMessageType.SAVE_FLOW_DEFINITION:
				this.handleSaveFlowDefinition(message as any);
				break;

			case O2WMessageType.ERROR:
				this.handleError(message as ErrorMessage);
				break;

			default:
				console.warn(`${this.logPrefix()} Unknown message type: ${message.type}`);
		}
	}

	/**
	 * Handle WORKER_WELCOME message
	 */
	private async handleWelcome(message: WorkerWelcomeMessage): Promise<void> {
		this.workerId = message.workerId;
		process.title = `Worker ${this.workerId}`;

		console.log(`${this.logPrefix()} Welcome received with assigned id=${message.workerId}`);

		// Request a task now that we're connected
		this.sendRequestTask();
	}

	/**
	 * Handle ERROR message from orchestrator
	 */
	private handleError(message: ErrorMessage): void {
		console.error(`${this.logPrefix()} Error from orchestrator: ${message.error}`);
	}

	/**
	 * Handle ASSIGN_TASK message
	 */
	private async handleAssignTask(message: AssignTaskMessage): Promise<void> {
		this.currentTask = message.task;
		console.log(`${this.logPrefix()} Assigned task ${this.currentTask.id}: ${this.currentTask.description}`);

		try {
			await this.executeTask(this.currentTask);
		} catch (error) {
			console.error(`${this.logPrefix()} Task execution error:`, error);
			this.sendTaskFailed((error as Error).message);
		}
	}

	/**
	 * Handle KILL_CLAUDE message
	 */
	private handleKillClaude(message: KillClaudeMessage): void {
		console.log(`${this.logPrefix()} Kill Claude requested: ${message.reason}`);
		this.claudeProcessManager.kill();
	}

	/**
	 * Handle REQUEST_FLOW_DEFINITION message
	 */
	private handleRequestFlowDefinition(message: any): void {
		const { flowId, requestId } = message;
		console.log(`${this.logPrefix()} Received REQUEST_FLOW_DEFINITION for ${flowId}`);

		try {
			// Read flows from local flows.yml file
			const flowsFilePath = path.join(this.projectRoot, '.agent-fleet', 'flows.yml');

			if (!existsSync(flowsFilePath)) {
				throw new Error(`Flows file not found: ${flowsFilePath}`);
			}

			const fileContents = readFileSync(flowsFilePath, 'utf8');
			const flows = yaml.load(fileContents) as Record<string, any>;

			const flowDefinition = flows[flowId];
			if (!flowDefinition) {
				throw new Error(`Flow ${flowId} not found in flows.yml`);
			}

			// Add the id to the definition
			const completeDefinition = {
				id: flowId,
				...flowDefinition,
			};

			// Send response
			this.sendMessage(
				createW2OMessage(W2OMessageType.FLOW_DEFINITION_RESPONSE, {
					workerId: this.workerId,
					requestId,
					flowId,
					flowDefinition: completeDefinition,
				})
			);

			console.log(`${this.logPrefix()} Sent FLOW_DEFINITION_RESPONSE for ${flowId}`);
		} catch (error) {
			console.error(`${this.logPrefix()} Error handling REQUEST_FLOW_DEFINITION:`, error);

			// Send error response
			this.sendMessage(
				createW2OMessage(W2OMessageType.FLOW_DEFINITION_RESPONSE, {
					workerId: this.workerId,
					requestId,
					flowId,
					flowDefinition: null,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			);
		}
	}

	/**
	 * Handle SAVE_FLOW_DEFINITION message
	 */
	private async handleSaveFlowDefinition(message: any): Promise<void> {
		const { flowId, flowDefinition, requestId } = message;
		console.log(`${this.logPrefix()} Received SAVE_FLOW_DEFINITION for ${flowId}`);

		try {
			// Read current flows from file
			const flowsFilePath = path.join(this.projectRoot, '.agent-fleet', 'flows.yml');

			if (!existsSync(flowsFilePath)) {
				throw new Error(`Flows file not found: ${flowsFilePath}`);
			}

			const fileContents = readFileSync(flowsFilePath, 'utf8');
			const flows = yaml.load(fileContents) as Record<string, any>;

			// Remove the id field as it's the key
			const { id, ...flowData } = flowDefinition;

			// Update the flow
			flows[flowId] = flowData;

			// Write back to file
			const newContent = yaml.dump(flows, {
				indent: 4,
				lineWidth: 120,
				noRefs: true,
				sortKeys: false,
			});

			writeFileSync(flowsFilePath, newContent, 'utf8');

			// Reload flows in registry
			await this.flowRegistry.loadProjectFlows();

			// Send updated flow list to orchestrator
			const flowMetadata = this.buildFlowMetadata();

			this.sendMessage(
				createW2OMessage(W2OMessageType.FLOWS_UPDATED, {
					workerId: this.workerId,
					projectId: this.projectId,
					flows: flowMetadata,
				})
			);

			// Send success response
			this.sendMessage(
				createW2OMessage(W2OMessageType.FLOW_SAVED_RESPONSE, {
					workerId: this.workerId,
					requestId,
					flowId,
					success: true,
				})
			);

			console.log(`${this.logPrefix()} Successfully saved flow ${flowId}`);
		} catch (error) {
			console.error(`${this.logPrefix()} Error handling SAVE_FLOW_DEFINITION:`, error);

			// Send error response
			this.sendMessage(
				createW2OMessage(W2OMessageType.FLOW_SAVED_RESPONSE, {
					workerId: this.workerId,
					requestId,
					flowId,
					success: false,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			);
		}
	}

	/**
	 * Handle messages from Claude processes (via hooks)
	 */
	private handleClaudeMessage(message: any): void {
		switch (message.type) {
			case 'STOP_REQUESTED':
				console.log(`${this.logPrefix()} Stop requested by Claude, killing process...`);
				this.claudeProcessManager.kill();
				break;

			case 'HOOK_EVENT':
				console.log(`${this.logPrefix()} Hook event: ${message.hookName}`);
				break;

			default:
				console.log(`${this.logPrefix()} Unknown message type: ${message.type}`);
		}
	}

	/**
	 * Load flows from project configuration
	 */
	private async loadFlows(): Promise<void> {
		try {
			await this.flowRegistry.loadProjectFlows();
			const flowIds = this.flowRegistry.getFlowIds();
			console.log(`${this.logPrefix()} Loaded ${flowIds.length} flows: ${flowIds.join(', ')}`);

			// Start watching flows file for changes with hot-reload callback
			this.flowRegistry.startWatching();

			// Set up hot-reload callback (if FlowRegistry supports it)
			// For now, we'll implement a polling mechanism to detect changes
			this.setupFlowHotReload();
		} catch (error) {
			console.error(`${this.logPrefix()} Failed to load flows:`, error);
		}
	}

	/**
	 * Setup hot-reload mechanism to detect flow changes
	 * This polls the flow registry to detect changes and sends FLOWS_UPDATED
	 */
	private setupFlowHotReload(): void {
		// Store initial flow state with hashes to detect content changes
		let lastFlowState = new Map<string, string>(); // flowId → hash
		this.buildFlowMetadata().forEach(flow => {
			lastFlowState.set(flow.id, flow.hash);
		});

		// Poll every 2 seconds to detect changes
		setInterval(() => {
			// Build current flow state with hashes
			const currentFlowState = new Map<string, string>();
			const updatedFlows = this.buildFlowMetadata();
			updatedFlows.forEach(flow => {
				currentFlowState.set(flow.id, flow.hash);
			});

			// Check if flows have changed
			const added = [...currentFlowState.keys()].filter(id => !lastFlowState.has(id));
			const removed = [...lastFlowState.keys()].filter(id => !currentFlowState.has(id));
			const updated = [...currentFlowState.keys()].filter(
				id => lastFlowState.has(id) && lastFlowState.get(id) !== currentFlowState.get(id)
			);

			if (added.length > 0 || removed.length > 0 || updated.length > 0) {
				console.log(
					`${this.logPrefix()} Flows changed - added: ${added.length}, removed: ${removed.length}, updated: ${updated.length}`
				);

				// Send FLOWS_UPDATED message
				this.sendFlowsUpdated(updatedFlows, {
					added,
					removed,
					updated,
				});

				// Update our snapshot
				lastFlowState = currentFlowState;
			}
		}, 2000); // Poll every 2 seconds
	}

	/**
	 * Send FLOWS_UPDATED message
	 */
	private sendFlowsUpdated(flows: any[], changes?: { added: string[]; removed: string[]; updated: string[] }): void {
		this.sendMessage(
			createW2OMessage(W2OMessageType.FLOWS_UPDATED, {
				workerId: this.workerId,
				projectId: this.projectId,
				flows,
				changes,
			})
		);
	}

	/**
	 * Build flow metadata for all loaded flows
	 * Metadata includes version, computed hash, and validation state for each flow
	 * @returns Array of flow metadata objects
	 */
	public buildFlowMetadata(): FlowMetadata[] {
		const flows = this.flowRegistry.getAllFlows();

		return flows.map(flow => {
			const hash = this.flowRegistry.computeFlowHash(flow);
			const validationResult = this.flowRegistry.getFlowValidationResult(flow.id);

			// Extract errors and warnings separately
			const errors = validationResult?.issues.filter(i => i.severity === 'error') || [];
			const warnings = validationResult?.issues.filter(i => i.severity === 'warning') || [];

			return {
				id: flow.id,
				version: flow.version,
				hash,
				name: flow.name,
				description: flow.description,
				inputs: flow.inputs,
				workspace: flow.workspace,
				statusTransitions: flow.statusTransitions,

				// Validation state
				isValid: validationResult?.valid ?? true, // Default to valid if not validated
				validationErrors: errors.length > 0 ? errors : undefined,
				validationWarnings: warnings.length > 0 ? warnings : undefined,
			};
		});
	}

	/**
	 * Start monitoring execution trace and update UI
	 */
	private startTraceMonitoring(taskId: string): NodeJS.Timeout {
		// const stateManager = this.workerUIManager.getStateManager();
		// if (!stateManager) {
		// No UI, return dummy interval
		return setInterval(() => {}, 1000);
		// }
		//
		// // Set state manager for monitor
		// this.flowExecutionMonitor.setStateManager(stateManager);
		//
		// return setInterval(() => {
		// 	const currentTask = this.currentTask;
		// 	if (currentTask) {
		// 		this.flowExecutionMonitor.monitorTaskTrace(currentTask);
		// 	}
		// }, 200); // Poll every 200ms
	}

	/**
	 * Execute a task - either a flow-based task or error if no flowId
	 */
	protected async executeTask(task: Task): Promise<void> {
		console.log(`${this.logPrefix()} Starting task execution...`);

		// Check if task has a flowId
		if (!task.flowId) {
			const error = 'FlowWorker requires task.flowId to be set';
			console.error(`${this.logPrefix()} ${error}`);
			throw new Error(error);
		}

		// Get the flow definition
		const flow = this.flowRegistry.getFlow(task.flowId);
		if (!flow) {
			const error = `Flow '${task.flowId}' not found in registry`;
			console.error(`${this.logPrefix()} ${error}`);
			throw new Error(error);
		}

		// Check if flow is valid before execution (defense in depth)
		const validationResult = this.flowRegistry.getFlowValidationResult(task.flowId);
		if (validationResult && !validationResult.valid) {
			const errorMessages = validationResult.issues
				.filter(i => i.severity === 'error')
				.map(i => `  - ${i.message}${i.location?.stepId ? ` (at step: ${i.location.stepId})` : ''}`)
				.join('\n');

			const error = `Cannot execute flow '${task.flowId}': Flow has validation errors:\n${errorMessages}`;
			console.error(`${this.logPrefix()} ${error}`);
			throw new Error(error);
		}

		// Determine status transitions based on flow configuration
		const defaultOnSuccess = TaskStatus.REVIEW;
		const defaultOnFailure = TaskStatus.CHANGES_REQUESTED;
		const successStatus = flow.statusTransitions?.onSuccess ?? defaultOnSuccess;
		const failureStatus = flow.statusTransitions?.onFailure ?? defaultOnFailure;

		console.log(`${this.logPrefix()} Executing flow: ${flow.name} (${flow.id})`);
		this.sendTaskStarted(TaskStatus.IN_PROGRESS);

		let workspace: Workspace | null = null;

		try {
			// Allocate workspace based on flow configuration
			this.sendTaskProgress('Allocating workspace...');

			// Determine workspace path
			let workspacePath: string | undefined;

			// If task specifies a workspace path, use it (OVERRIDE)
			if (task.workspacePath) {
				workspacePath = task.workspacePath;
				console.log(`${this.logPrefix()} Using task-specified workspace override: ${workspacePath}`);
			}
			// Otherwise, if manual mode but no path specified, use current working directory
			else if (flow.workspace.mode === 'manual') {
				workspacePath = process.cwd();
				console.log(
					`${this.logPrefix()} Using current working directory as manual workspace: ${workspacePath}`
				);
			}

			workspace = await this.workspaceManager.allocate({
				taskId: task.id,
				config: flow.workspace,
				existingPath: workspacePath,
				taskMetadata: {
					description: task.description,
					priority: task.priority,
					workspaceId: task.metadata?.workspaceId, // Track workspace ID
					...task.metadata,
				},
			});

			console.log(`${this.logPrefix()} Workspace allocated: ${workspace.id} (${workspace.path})`);
			this.sendTaskProgress(`Workspace ready: ${workspace.path}`);

			// Prepare execution options
			const executionOptions: FlowExecutionOptions = {
				taskId: task.id,
				flow,
				workspace,
				inputs: task.flowInputs || {},
				taskMetadata: {
					priority: task.priority,
					createdAt: task.createdAt,
					description: task.description,
					...task.metadata,
				},
				// Pass Claude environment variables for hooks
				claudeEnv: {
					CLAUDE_WORKER_ID: this.workerId,
					CLAUDE_WORKER_SOCKET: `ws://localhost:${this.claudeProcessManager.getWebSocketPort()}`,
					CLAUDE_TASK_ID: task.id,
					CLAUDE_CONTEXT_DIR: workspace.path,
					CLAUDE_CODE_STOPPABLE: this.interactive ? 'true' : 'false',
				},
				// Callback to store Claude process reference
				onClaudeProcessStarted: (process: ChildProcess) => {
					this.claudeProcessManager.trackProcess(process);
				},
			};

			// Execute the flow
			this.sendTaskProgress('Executing flow steps...');

			// Start monitoring execution trace if UI is enabled
			const monitorInterval: NodeJS.Timeout | null = null;
			// if (this.workerUIManager.isEnabled()) {
			// 	monitorInterval = this.startTraceMonitoring(task.id);
			// }

			const result = await this.flowExecutor.execute(executionOptions);

			// Stop monitoring
			if (monitorInterval) {
				clearInterval(monitorInterval);
			}

			// Store result in task
			task.flowResult = {
				status: result.success ? 'completed' : 'failed',
				outputs: result.outputs,
				error: result.error,
				trace: result.trace,
			};

			if (result.success) {
				console.log(`${this.logPrefix()} Flow completed successfully`);

				// // Update UI
				// this.workerUIManager.taskCompleted();

				this.sendTaskCompleted(
					{
						message: 'Flow execution completed',
						outputs: result.outputs,
						trace: result.trace,
					},
					successStatus
				);
			} else {
				console.error(`${this.logPrefix()} Flow failed: ${result.error}`);

				// // Update UI
				// this.workerUIManager.taskFailed(result.error || 'Flow execution failed');

				this.sendTaskFailed(result.error || 'Flow execution failed', failureStatus);
			}
		} catch (error) {
			console.error(`${this.logPrefix()} Task execution error:`, error);

			// Store error in task
			task.flowResult = {
				status: 'failed',
				error: (error as Error).message,
			};

			// Send failure with configured status
			this.sendTaskFailed((error as Error).message, failureStatus);
		} finally {
			// Release workspace
			if (workspace) {
				try {
					console.log(`${this.logPrefix()} Releasing workspace ${workspace.id}...`);
					await this.workspaceManager.release(workspace.id, task.id);
					console.log(`${this.logPrefix()} Workspace released`);
				} catch (error) {
					console.error(`${this.logPrefix()} Failed to release workspace:`, error);
				}
			}
		}
	}

	/**
	 * Send task started notification
	 */
	protected sendTaskStarted(newStatus?: TaskStatus): void {
		if (!this.currentTask) return;

		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_STARTED, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				newStatus,
			})
		);
	}

	/**
	 * Send task progress update
	 */
	protected sendTaskProgress(progress: string): void {
		if (!this.currentTask) return;

		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_PROGRESS, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				progress,
			})
		);
	}

	/**
	 * Send task completed notification
	 */
	protected sendTaskCompleted(result?: any, newStatus?: TaskStatus): void {
		if (!this.currentTask) return;

		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				result,
				newStatus,
			})
		);

		this.currentTask = null;

		// Request another task after completion
		this.sendRequestTask();
	}

	/**
	 * Send task failed notification
	 */
	protected sendTaskFailed(error: string, newStatus?: TaskStatus): void {
		if (!this.currentTask) return;

		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_FAILED, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				error,
				newStatus,
			})
		);

		this.currentTask = null;

		// Request another task after failure
		this.sendRequestTask();
	}

	/**
	 * Send task question
	 */
	protected sendTaskQuestion(question: string): void {
		if (!this.currentTask) return;

		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_QUESTION, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				question,
			})
		);
	}

	/**
	 * Send stop requested (from Claude hook)
	 */
	protected sendStopRequested(claudePid: number): void {
		if (!this.currentTask) return;

		this.sendMessage(
			createW2OMessage(W2OMessageType.STOP_REQUESTED, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				claudePid,
			})
		);
	}

	/**
	 * Send hook event
	 */
	protected sendHookEvent(hookName: string, data: any): void {
		this.sendMessage(
			createW2OMessage(W2OMessageType.HOOK_EVENT, {
				workerId: this.workerId,
				hookName,
				data,
			})
		);
	}

	/**
	 * Send REQUEST_TASK message to request a new task
	 */
	protected sendRequestTask(): void {
		this.sendMessage(
			createW2OMessage(W2OMessageType.REQUEST_TASK, {
				workerId: this.workerId,
			})
		);
	}

	/**
	 * Send a message to orchestrator
	 */
	protected sendMessage(message: W2OMessage): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(serializeMessage(message));
		} else {
			console.error(`${this.logPrefix()} Cannot send message, not connected`);
		}
	}

	protected logPrefix(): string {
		return `[FlowWorker ${this.workerId}]`;
	}

	/**
	 * Format connection errors in a concise single-line format
	 */
	private formatConnectionError(error: any): string {
		if (error.code === 'ECONNREFUSED') {
			return 'Connection refused - orchestrator not running?';
		}
		if (error.code === 'ETIMEDOUT') {
			return 'Connection timeout';
		}
		if (error.code === 'ENOTFOUND') {
			return 'Host not found';
		}
		// For other errors, show just the message
		return error.message || String(error);
	}

	/**
	 * Kill Claude process if running
	 */
	killClaude(): void {
		this.claudeProcessManager.kill();
	}

	/**
	 * Cleanup on shutdown
	 */
	shutdown(): void {
		console.log(`${this.logPrefix()} Shutting down...`);

		// // Stop UI
		// this.workerUIManager.stop();

		// Stop watching flows file
		this.flowRegistry.stopWatching();

		// Cleanup Claude process manager
		this.claudeProcessManager.shutdown();

		// Cleanup all workspaces
		this.workspaceManager.cleanupAll();

		// Close WebSocket connection
		this.stopHeartbeat();
		if (this.ws) {
			this.ws.close();
		}
	}
}

// Entry point if run directly
const currentFilePath = fileURLToPath(import.meta.url);
const mainFilePath = process.argv[1];
const isMainModule = currentFilePath === mainFilePath;

if (isMainModule) {
	console.log('[FlowWorker] Starting Flow Worker...');

	// Load environment variables from root .env and package .env files
	// Root .env is loaded first, then package .env (which can override)
	// Calculate paths relative to the worker's source directory structure:
	// __dirname = packages/worker/src/flow
	// root .env = . (project root)
	// package .env = packages/worker
	const __dirname = fileURLToPath(new URL('.', import.meta.url));
	const rootEnvPath = join(__dirname, '../../../../.env');
	const packageEnvPath = join(__dirname, '../../.env');

	console.log(`[FlowWorker] Loading .env files:`);
	console.log(`[FlowWorker] - Root:    ${rootEnvPath}`);
	console.log(`[FlowWorker] - Package: ${packageEnvPath}`);

	dotenv.config({ path: rootEnvPath });
	dotenv.config({ path: packageEnvPath });

	console.log(`[FlowWorker] Loaded WORKSPACE_ID=${process.env.WORKSPACE_ID}, PROJECT_ID=${process.env.PROJECT_ID}`);

	// Check for interactive mode from CLI args or environment variable
	const interactiveArg = process.argv.includes('--interactive') || process.argv.includes('-i');
	const interactiveEnv = process.env.WORKER_INTERACTIVE === 'true';
	const interactive = interactiveArg || interactiveEnv;

	const noUiArg = process.argv.includes('--no-ui');

	// @formatter:off
	// UI mode is always enabled (terminal-kit)
	const enableUI = !noUiArg;
	// @formatter:on

	// Parse worker ID from CLI args or environment variable
	const workerIdArg = process.argv.find(arg => arg.startsWith('--worker-id='));
	const preferredWorkerId = workerIdArg ? workerIdArg.split('=')[1] : process.env.WORKER_ID;

	// Parse project root from CLI args or environment variable
	const projectRootArg = process.argv.find(arg => arg.startsWith('--project-root='));
	const projectRootRelative = projectRootArg
		? projectRootArg.split('=')[1]
		: process.env.PROJECT_ROOT || process.cwd();
	// Always resolve to absolute path
	const projectRoot = resolve(projectRootRelative);

	const worker = new FlowWorker(undefined, projectRoot, interactive, preferredWorkerId, enableUI);

	worker
		.connect()
		.then(() => {
			console.log('[FlowWorker] Worker started and connected');
		})
		.catch(error => {
			console.error('[FlowWorker] Initial connection failed:', error.message);
			console.log('[FlowWorker] Will keep retrying to connect to orchestrator...');
			// Don't exit - the worker will automatically retry with exponential backoff
		});

	// Handle shutdown signals
	process.on('SIGINT', () => {
		console.log('\n[FlowWorker] Received SIGINT, shutting down...');
		worker.shutdown();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		console.log('\n[FlowWorker] Received SIGTERM, shutting down...');
		worker.shutdown();
		process.exit(0);
	});
}
