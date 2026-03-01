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
import type {
	InterventionHandler,
	InterventionRequest,
	InterventionResponse,
} from 'flow-engine/executor/InterventionHandler';
import { FlowRegistry } from 'flow-engine/registry/FlowRegistry';
import type { FlowMetadata, Workspace } from 'flow-engine/types';
import { WorkspaceManager } from 'flow-engine/workspace/WorkspaceManager';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { join, resolve } from 'path';
import * as path from 'path';
import { getOrchestratorWsUrl } from 'shared-common/PortCalculator';
import type { Shutdownable } from 'shared-common/Shutdownable';
import { type Logger, createLogger } from 'shared-common/logger';
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
	private logger: Logger;

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

	// Trace update management
	private traceUpdateTimer: NodeJS.Timeout | null = null;
	private readonly TRACE_UPDATE_INTERVAL = 500; // 500ms
	private lastSentTraceHash: string | null = null; // Hash of last sent trace to avoid duplicates

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

	// Intervention handling
	private pendingInterventions: Map<
		string,
		{
			resolve: (response: InterventionResponse | null) => void;
			reject: (error: Error) => void;
		}
	> = new Map();

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
		this.logger = createLogger('FlowWorker ?');

		this.interactive = interactive;
		this.projectRoot = projectRoot;
		this.logger.info(` Initializing with project root: ${projectRoot}`);
		if (interactive) this.logger.info(` Interactive mode enabled`);
		if (preferredWorkerId) this.logger.info(` Preferred worker ID: ${preferredWorkerId}`);
		if (enableUI) this.logger.info(` UI enabled`);

		// Initialize specialized managers
		this.claudeProcessManager = new ClaudeLifecycleManager(this.workerId);
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
			this.logger.info(` Connecting to ${this.wsUrl}...`);

			this.ws = new WebSocket(this.wsUrl);

			this.ws.on('open', () => {
				this.logger.info(` Connected`);

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
					this.logger.error(` Error parsing message:`, (error as Error).message);
				}
			});

			this.ws.on('close', () => {
				this.logger.info(` Disconnected`);
				this.stopHeartbeat();
				this.scheduleReconnect();
			});

			this.ws.on('error', error => {
				this.logger.error(` WebSocket error: ${this.formatConnectionError(error)}`);
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
				this.logger.info(` Detected project ID from package.json: ${packageJson.name}`);
				return packageJson.name;
			}
		} catch (error) {
			// package.json not found or doesn't have name, try git
		}

		// Try to get git remote origin
		try {
			const gitRemote = this.detectGitRemoteSync();
			if (gitRemote) {
				this.logger.info(` Detected project ID from git remote: ${gitRemote}`);
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
			this.logger.info(` Detecting git branch in: ${this.projectRoot}`);
			const branch = execSync('git branch --show-current', {
				cwd: this.projectRoot,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
			}).trim();

			this.logger.info(` Git command result: "${branch}" (length: ${branch.length})`);
			return branch || null;
		} catch (error) {
			// Not in a git repository or git command failed
			this.logger.error(` Git detection failed:`, (error as Error).message);
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

		this.logger.info(` Detected git branch: ${gitBranch || 'null'} for workspace: ${workspacePath}`);

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

		this.logger.info(` Reconnecting in ${delay}ms... (attempt ${this.reconnectionAttempts})`);

		setTimeout(() => {
			this.connect().catch(error => {
				this.logger.error(` Reconnection failed: ${this.formatConnectionError(error)}`);
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
				this.logger.info(` Received PAUSE`);
				// TODO: Implement pause logic
				break;

			case O2WMessageType.RESUME:
				this.logger.info(` Received RESUME`);
				// TODO: Implement resume logic
				break;

			case O2WMessageType.SHUTDOWN:
				this.logger.info(` Received SHUTDOWN`);
				this.shutdown();
				break;

			case O2WMessageType.REQUEST_FLOW_DEFINITION:
				this.handleRequestFlowDefinition(message as any);
				break;

			case O2WMessageType.SAVE_FLOW_DEFINITION:
				this.handleSaveFlowDefinition(message as any);
				break;

			case O2WMessageType.INTERVENTION_RESPONSE:
				this.handleInterventionResponse(message as any);
				break;

			case O2WMessageType.ERROR:
				this.handleError(message as ErrorMessage);
				break;

			default:
				this.logger.warn(` Unknown message type: ${(message as any).type}`);
		}
	}

	/**
	 * Create an intervention handler for flow execution
	 */
	private createInterventionHandler(): InterventionHandler {
		return {
			requestIntervention: async (request: InterventionRequest): Promise<InterventionResponse | null> => {
				// Generate unique intervention ID (worker-controlled)
				// Use '-' instead of ':' to ensure Windows file system compatibility
				const interventionId = `${request.taskId}-${request.stepId}-${Date.now()}`;

				this.logger.info(
					` Requesting intervention: ${request.type} for step ${request.stepId} (blocking: ${request.blocking}, id: ${interventionId})`
				);

				// Send intervention request to orchestrator
				this.sendMessage(
					createW2OMessage(W2OMessageType.INTERVENTION_REQUESTED, {
						workerId: this.workerId,
						taskId: request.taskId,
						interventionId,
						flowId: request.flowId,
						stepId: request.stepId,
						interventionType: request.type,
						blocking: request.blocking,
						config: request.config,
						timeout: request.timeout,
					})
				);

				// For non-blocking interventions, return immediately
				if (!request.blocking) {
					this.logger.info(` Non-blocking intervention requested, continuing...`);
					return null;
				}

				// For blocking interventions, wait for response
				return new Promise<InterventionResponse | null>((resolve, reject) => {
					// Store promise handlers to be called when response arrives
					this.pendingInterventions.set(interventionId, { resolve, reject });

					// Setup timeout if configured
					if (request.timeout) {
						const timeoutMs = request.timeout.minutes * 60 * 1000;
						setTimeout(() => {
							const pending = this.pendingInterventions.get(interventionId);
							if (pending) {
								this.pendingInterventions.delete(interventionId);

								if (request.timeout!.onTimeout === 'fail') {
									reject(
										new Error(`Intervention timed out after ${request.timeout!.minutes} minutes`)
									);
								} else if (request.timeout!.onTimeout === 'continue') {
									resolve(null);
								} else if (request.timeout!.onTimeout === 'default') {
									// Use default value
									resolve({
										value: request.timeout!.defaultValue,
										answeredAt: new Date().toISOString(),
										answeredBy: 'system (timeout)',
									});
								}
							}
						}, timeoutMs);
					}
				});
			},
		};
	}

	/**
	 * Handle WORKER_WELCOME message
	 */
	private async handleWelcome(message: WorkerWelcomeMessage): Promise<void> {
		this.workerId = message.workerId;
		this.logger = createLogger(`FlowWorker ${this.workerId}`);
		process.title = `Worker ${this.workerId}`;

		this.logger.info(`Welcome received with assigned id=${message.workerId}`);

		// Request a task now that we're connected
		this.sendRequestTask();
	}

	/**
	 * Handle INTERVENTION_RESPONSE message
	 */
	private handleInterventionResponse(message: any): void {
		const { taskId, interventionId, response, timedOut, cancelled } = message;

		this.logger.info(` Received intervention response for ${interventionId}`);

		// Find the pending intervention using interventionId
		// The interventionId should match what we used as the key when storing the promise
		const pending = this.pendingInterventions.get(interventionId);
		if (!pending) {
			this.logger.warn(`Received intervention response for unknown intervention: ${interventionId}`);
			return;
		}

		// Remove from pending map
		this.pendingInterventions.delete(interventionId);

		// Resolve or reject the promise based on response
		if (cancelled) {
			pending.reject(new Error('Intervention was cancelled'));
		} else if (timedOut) {
			pending.reject(new Error('Intervention timed out'));
		} else if (response) {
			pending.resolve(response);
		} else {
			pending.resolve(null);
		}
	}

	/**
	 * Handle ERROR message from orchestrator
	 */
	private handleError(message: ErrorMessage): void {
		this.logger.error(` Error from orchestrator: ${message.error}`);
	}

	/**
	 * Handle ASSIGN_TASK message
	 */
	private async handleAssignTask(message: AssignTaskMessage): Promise<void> {
		this.currentTask = message.task;
		this.logger.info(` Assigned task ${this.currentTask.id}: ${this.currentTask.description}`);

		try {
			await this.executeTask(this.currentTask);
		} catch (error) {
			this.logger.error(` Task execution error:`, error);
			this.sendTaskFailed((error as Error).message);
		}
	}

	/**
	 * Handle KILL_CLAUDE message
	 */
	private handleKillClaude(message: KillClaudeMessage): void {
		this.logger.info(` Kill Claude requested: ${message.reason}`);
		this.claudeProcessManager.kill();
	}

	/**
	 * Handle REQUEST_FLOW_DEFINITION message
	 */
	private handleRequestFlowDefinition(message: any): void {
		const { flowId, requestId } = message;
		this.logger.info(` Received REQUEST_FLOW_DEFINITION for ${flowId}`);

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

			this.logger.info(` Sent FLOW_DEFINITION_RESPONSE for ${flowId}`);
		} catch (error) {
			this.logger.error(` Error handling REQUEST_FLOW_DEFINITION:`, error);

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
		this.logger.info(` Received SAVE_FLOW_DEFINITION for ${flowId}`);

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

			this.logger.info(` Successfully saved flow ${flowId}`);
		} catch (error) {
			this.logger.error(` Error handling SAVE_FLOW_DEFINITION:`, error);

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
				this.logger.info(` Stop requested by Claude, killing process...`);
				this.claudeProcessManager.kill();
				break;

			case 'HOOK_EVENT':
				this.logger.info(` Hook event: ${message.hookName}`);
				break;

			default:
				this.logger.info(` Unknown message type: ${message.type}`);
		}
	}

	/**
	 * Load flows from project configuration
	 */
	private async loadFlows(): Promise<void> {
		try {
			await this.flowRegistry.loadProjectFlows();
			const flowIds = this.flowRegistry.getFlowIds();
			this.logger.info(` Loaded ${flowIds.length} flows: ${flowIds.join(', ')}`);

			// If the WebSocket was already open when we finished loading (race condition:
			// sendWorkerReady fired before loadProjectFlows completed), send FLOWS_UPDATED
			// so the orchestrator gets the full flow list including event-triggered flows.
			if (this.ws?.readyState === WebSocket.OPEN) {
				const flowMetadata = this.buildFlowMetadata();
				this.sendMessage(
					createW2OMessage(W2OMessageType.FLOWS_UPDATED, {
						workerId: this.workerId,
						projectId: this.projectId,
						flows: flowMetadata,
					})
				);
				this.logger.info(` Sent FLOWS_UPDATED after initial load (${flowMetadata.length} flows)`);
			}

			// Start watching flows file for changes with hot-reload callback
			this.flowRegistry.startWatching();

			// Set up hot-reload callback (if FlowRegistry supports it)
			// For now, we'll implement a polling mechanism to detect changes
			this.setupFlowHotReload();
		} catch (error) {
			this.logger.error(` Failed to load flows:`, error);
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
				this.logger.info(
					` Flows changed - added: ${added.length}, removed: ${removed.length}, updated: ${updated.length}`
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

		return flows.map((flow: any) => {
			const hash = this.flowRegistry.computeFlowHash(flow);
			const validationResult = this.flowRegistry.getFlowValidationResult(flow.id);

			// Extract errors and warnings separately
			const errors = validationResult?.issues.filter((i: any) => i.severity === 'error') || [];
			const warnings = validationResult?.issues.filter((i: any) => i.severity === 'warning') || [];

			return {
				id: flow.id,
				version: flow.version,
				hash,
				name: flow.name,
				description: flow.description,
				// Use normalized + auto-discovered inputs if available (populated during validation)
				// Otherwise provide empty object for flows that haven't been validated yet
				inputs: flow._autoDiscoveredInputs || {},
				workspace: flow.workspace,
				statusTransitions: flow.statusTransitions,
				trigger: flow.trigger,

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
		this.logger.info(` Starting task execution...`);

		// Reset trace hash for new task execution
		this.lastSentTraceHash = null;

		// Check if task has a flowId
		if (!task.flowId) {
			const error = 'FlowWorker requires task.flowId to be set';
			this.logger.error(` ${error}`);
			throw new Error(error);
		}

		// Get the flow definition
		const flow = this.flowRegistry.getFlow(task.flowId);
		if (!flow) {
			const error = `Flow '${task.flowId}' not found in registry`;
			this.logger.error(` ${error}`);
			throw new Error(error);
		}

		// Check if flow is valid before execution (defense in depth)
		const validationResult = this.flowRegistry.getFlowValidationResult(task.flowId);
		if (validationResult && !validationResult.valid) {
			const errorMessages = validationResult.issues
				.filter((i: any) => i.severity === 'error')
				.map((i: any) => `  - ${i.message}${i.location?.stepId ? ` (at step: ${i.location.stepId})` : ''}`)
				.join('\n');

			const error = `Cannot execute flow '${task.flowId}': Flow has validation errors:\n${errorMessages}`;
			this.logger.error(` ${error}`);
			throw new Error(error);
		}

		// Determine status transitions based on flow configuration
		const defaultOnSuccess = TaskStatus.REVIEW;
		const defaultOnFailure = TaskStatus.CHANGES_REQUESTED;
		// Extract TaskStatus from either a plain string or StatusTransitionConfig object
		const resolveTaskStatus = (
			value: TaskStatus | import('flow-engine/types').StatusTransitionConfig | undefined,
			defaultValue: TaskStatus
		): TaskStatus => {
			if (!value) return defaultValue;
			if (typeof value === 'string') return value;
			return value.task ?? defaultValue;
		};
		const successStatus = resolveTaskStatus(flow.statusTransitions?.onSuccess, defaultOnSuccess);
		const failureStatus = resolveTaskStatus(flow.statusTransitions?.onFailure, defaultOnFailure);
		// Extract TicketStatus from StatusTransitionConfig object
		const resolveTicketStatus = (
			value: TaskStatus | import('flow-engine/types').StatusTransitionConfig | undefined
		): import('shared-orch-worker/domain-types').TicketStatus | undefined =>
			typeof value === 'object' ? value.ticket : undefined;
		const successTicketStatus = resolveTicketStatus(flow.statusTransitions?.onSuccess);
		const failureTicketStatus = resolveTicketStatus(flow.statusTransitions?.onFailure);

		this.logger.info(` Executing flow: ${flow.name} (${flow.id})`);
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
				this.logger.info(` Using task-specified workspace override: ${workspacePath}`);
			}
			// Otherwise, if manual mode but no path specified, use current working directory
			else if (flow.workspace.mode === 'manual') {
				workspacePath = process.cwd();
				this.logger.info(` Using current working directory as manual workspace: ${workspacePath}`);
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

			this.logger.info(` Workspace allocated: ${workspace.id} (${workspace.path})`);
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
				// Intervention handler for user_intervention steps
				interventionHandler: this.createInterventionHandler(),
				// Real-time trace update callback (called after each step completion)
				onTraceUpdate: (trace: any) => {
					this.logger.debug(`[TRACE] onTraceUpdate called - steps=${trace?.steps?.length || 0}`);
					// Update the task's trace in-place so the 500ms timer can access it
					if (this.currentTask?.flowResult) {
						this.currentTask.flowResult.trace = trace;
						this.logger.debug(
							`[TRACE] Updated currentTask.flowResult.trace - steps=${this.currentTask.flowResult.trace?.steps?.length || 0}`
						);
					} else {
						this.logger.warn(` [TRACE] WARNING: No currentTask or flowResult to update!`);
					}
				},
			};

			// Execute the flow
			this.sendTaskProgress('Executing flow steps...');

			// Initialize task.flowResult BEFORE execution so timer can access it
			task.flowResult = {
				status: 'completed', // Will be updated by callback
				trace: {
					id: '',
					taskId: task.id,
					flowId: flow.id,
					workspaceId: workspace.id,
					startTime: Date.now(),
					status: 'running',
					steps: [],
				},
			};

			// Start monitoring execution trace if UI is enabled
			const monitorInterval: NodeJS.Timeout | null = null;
			// if (this.workerUIManager.isEnabled()) {
			// 	monitorInterval = this.startTraceMonitoring(task.id);
			// }

			// Start periodic trace updates (every 500ms)
			this.startTraceUpdates();

			const result = await this.flowExecutor.execute(executionOptions);

			// Stop periodic trace updates
			this.stopTraceUpdates();

			// Send final trace update after execution completes
			if (this.currentTask?.flowResult?.trace) {
				this.logger.info(
					` [TRACE] Sending FINAL trace update after execution - steps=${this.currentTask.flowResult.trace.steps?.length || 0}`
				);
				this.sendTraceUpdate(this.currentTask.flowResult.trace);
			}

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
				this.logger.info(` Flow completed successfully`);

				// // Update UI
				// this.workerUIManager.taskCompleted();

				this.sendTaskCompleted(
					{
						message: 'Flow execution completed',
						outputs: result.outputs,
						trace: result.trace,
					},
					successStatus,
					this.currentTask?.ticketId,
					successTicketStatus
				);
			} else {
				this.logger.error(` Flow failed: ${result.error}`);

				// // Update UI
				// this.workerUIManager.taskFailed(result.error || 'Flow execution failed');

				this.sendTaskFailed(
					result.error || 'Flow execution failed',
					failureStatus,
					this.currentTask?.ticketId,
					failureTicketStatus
				);
			}
		} catch (error) {
			this.logger.error(` Task execution error:`, error);

			// Stop trace updates on error
			this.stopTraceUpdates();

			// Store error in task
			task.flowResult = {
				status: 'failed',
				error: (error as Error).message,
			};

			// Send failure with configured status
			this.sendTaskFailed(
				(error as Error).message,
				failureStatus,
				this.currentTask?.ticketId,
				failureTicketStatus
			);
		} finally {
			// Release workspace
			if (workspace) {
				try {
					this.logger.info(` Releasing workspace ${workspace.id}...`);
					await this.workspaceManager.release(workspace.id, task.id);
					this.logger.info(` Workspace released`);
				} catch (error) {
					this.logger.error(` Failed to release workspace:`, error);
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
	 * Start periodic trace updates (every 500ms)
	 */
	private startTraceUpdates(): void {
		if (this.traceUpdateTimer) {
			clearInterval(this.traceUpdateTimer);
		}

		this.logger.info(` [TRACE] Starting trace updates (interval: ${this.TRACE_UPDATE_INTERVAL}ms)`);

		this.traceUpdateTimer = setInterval(() => {
			if (this.currentTask?.flowResult?.trace) {
				this.sendTraceUpdate(this.currentTask.flowResult.trace);
			} else {
				this.logger.info(
					` [TRACE] No trace available - task=${!!this.currentTask}, flowResult=${!!this.currentTask?.flowResult}, trace=${!!this.currentTask?.flowResult?.trace}`
				);
			}
		}, this.TRACE_UPDATE_INTERVAL);
	}

	/**
	 * Stop periodic trace updates
	 */
	private stopTraceUpdates(): void {
		if (this.traceUpdateTimer) {
			this.logger.info(` [TRACE] Stopping trace updates`);
			clearInterval(this.traceUpdateTimer);
			this.traceUpdateTimer = null;
		}
	}

	/**
	 * Send trace update to orchestrator
	 * Only sends if trace has changed since last update to avoid spam
	 */
	private sendTraceUpdate(trace: any): void {
		if (!this.currentTask) {
			this.logger.info(` [TRACE] sendTraceUpdate called but no current task`);
			return;
		}

		// Calculate hash of trace to detect changes
		const traceHash = JSON.stringify(trace);

		// Skip if trace hasn't changed since last send
		if (traceHash === this.lastSentTraceHash) {
			this.logger.debug(
				`[TRACE] Trace unchanged (hash match) - task=${this.currentTask.id}, steps=${trace?.steps?.length || 0}`
			);
			return;
		}

		// Update last sent hash
		this.lastSentTraceHash = traceHash;

		this.logger.debug(
			`[TRACE] Sending trace update - task=${this.currentTask.id}, steps=${trace?.steps?.length || 0}, ws.readyState=${this.ws?.readyState} (1=OPEN)`
		);

		// Send update to orchestrator
		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_TRACE_UPDATE, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				trace: trace,
			})
		);
	}

	/**
	 * Send task completed notification
	 */
	protected sendTaskCompleted(
		result?: any,
		newStatus?: TaskStatus,
		ticketId?: string,
		ticketStatus?: import('shared-orch-worker/domain-types').TicketStatus
	): void {
		if (!this.currentTask) return;

		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_COMPLETED, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				result,
				newStatus,
				ticketId,
				ticketStatus,
			})
		);

		this.currentTask = null;

		// Request another task after completion
		this.sendRequestTask();
	}

	/**
	 * Send task failed notification
	 */
	protected sendTaskFailed(
		error: string,
		newStatus?: TaskStatus,
		ticketId?: string,
		ticketStatus?: import('shared-orch-worker/domain-types').TicketStatus
	): void {
		if (!this.currentTask) return;

		this.sendMessage(
			createW2OMessage(W2OMessageType.TASK_FAILED, {
				workerId: this.workerId,
				taskId: this.currentTask.id,
				error,
				newStatus,
				ticketId,
				ticketStatus,
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
			this.logger.error(` Cannot send message, not connected`);
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
		this.logger.info(` Shutting down...`);

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
	// Create logger for entry point initialization
	const entryLog = createLogger('FlowWorker:main');
	entryLog.info('Starting Flow Worker...');

	// Load environment variables from root .env and package .env files
	// Root .env is loaded first, then package .env (which can override)
	// Calculate paths relative to the worker's source directory structure:
	// __dirname = packages/worker/src/flow
	// root .env = . (project root)
	// package .env = packages/worker
	const __dirname = fileURLToPath(new URL('.', import.meta.url));
	const rootEnvPath = join(__dirname, '../../../../.env');
	const packageEnvPath = join(__dirname, '../../.env');

	entryLog.info('Loading .env files:');
	entryLog.info(`- Root:    ${rootEnvPath}`);
	entryLog.info(`- Package: ${packageEnvPath}`);

	dotenv.config({ path: rootEnvPath });
	dotenv.config({ path: packageEnvPath });

	entryLog.info(`Loaded WORKSPACE_ID=${process.env.WORKSPACE_ID}, PROJECT_ID=${process.env.PROJECT_ID}`);

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
			entryLog.info('Worker started and connected');
		})
		.catch(error => {
			entryLog.error('Initial connection failed:', error.message);
			entryLog.info('Will keep retrying to connect to orchestrator...');
			// Don't exit - the worker will automatically retry with exponential backoff
		});

	// Handle shutdown signals
	process.on('SIGINT', () => {
		entryLog.info('\nReceived SIGINT, shutting down...');
		worker.shutdown();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		entryLog.info('\nReceived SIGTERM, shutting down...');
		worker.shutdown();
		process.exit(0);
	});
}
