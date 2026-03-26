import type { FlowRegistry } from 'flow-engine';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import * as path from 'path';
import { createLogger } from 'shared-common/logger';

import type { FlowDefinition, FlowListItem, FlowMetadata, FlowsByProject } from '@app/shared/api/flows.contract';

import type { EventBroadcaster } from '../transport/EventBroadcaster';

const log = createLogger('FlowsService');

/**
 * ===========================================================================================
 * FLOWS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for flows data.
 * Responsibilities:
 * - Fetch flows from OrchestratorWrapper
 * - Transform flows data if needed
 * - Handle orchestrator connection failures gracefully
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 *
 * ===========================================================================================
 */

export class FlowsService {
	private flowsFilePath: string;

	constructor(
		private readonly orchestratorWrapper: OrchestratorWrapper,
		private readonly eventBroadcaster: EventBroadcaster,
		// Optional: provides fallback for custom flows registered at runtime (e.g. approved proposals)
		private readonly registry?: FlowRegistry
	) {
		// Find monorepo root: go up until we find package.json with "workspaces"
		let currentDir = process.cwd();
		while (currentDir !== path.dirname(currentDir)) {
			const packageJsonPath = path.join(currentDir, 'package.json');
			if (fs.existsSync(packageJsonPath)) {
				const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
				if (packageJson.workspaces) {
					// Found monorepo root
					this.flowsFilePath = path.join(currentDir, '.agent-fleet', 'flows.yml');
					log.info(' Using flows file:', this.flowsFilePath);
					return;
				}
			}
			currentDir = path.dirname(currentDir);
		}

		// Fallback: use process.cwd()
		this.flowsFilePath = path.join(process.cwd(), '.agent-fleet', 'flows.yml');
		log.info(' Fallback - using flows file:', this.flowsFilePath);
	}

	/**
	 * Get all flows organized by project
	 */
	async getFlows(): Promise<FlowsByProject> {
		try {
			// Check if orchestratorWrapper is available (library mode)
			if (!this.orchestratorWrapper) {
				return {};
			}

			// Access FlowDiscoveryRegistry via OrchestratorWrapper (library mode)
			const orchestrator = this.orchestratorWrapper.getOrchestrator();
			const wsServer = orchestrator.getWsServer();

			if (!wsServer) {
				return {};
			}

			const flowDiscoveryRegistry = wsServer.getConnectionManager().getFlowDiscoveryRegistry();
			const allProjects = flowDiscoveryRegistry.getAllProjects();

			const flowsByProject: FlowsByProject = {};
			for (const projectId of allProjects) {
				const projectFlows = flowDiscoveryRegistry.getProjectFlows(projectId);
				if (projectFlows) {
					// projectFlows is Map<string, WorkerFlowEntry[]>
					// We need to transform it to Record<string, FlowMetadata>
					const flowsRecord: Record<string, FlowMetadata> = {};
					for (const [flowId, entries] of projectFlows) {
						if (entries.length > 0) {
							// Take the first entry's metadata (all entries should have same metadata)
							flowsRecord[flowId] = entries[0].metadata;
						}
					}
					flowsByProject[projectId] = flowsRecord;
				}
			}

			return flowsByProject;
		} catch (_error) {
			// Orchestrator is offline - return empty flows
			return {};
		}
	}

	/**
	 * Merge a file-based flow list with flows from the registry that are not yet in the list.
	 * Custom flows approved at runtime are registered in the FlowRegistry in memory but may
	 * not yet be present in flows.yml — this prevents 404s on GET /api/flows/:flowId.
	 */
	private mergeWithRegistryFlows(fileFlows: FlowListItem[]): FlowListItem[] {
		if (!this.registry) {
			return fileFlows;
		}
		const knownIds = new Set(fileFlows.map(f => f.id));
		const registryFlows = this.registry.getAllFlows();
		const extraFlows: FlowListItem[] = [];
		for (const flow of registryFlows) {
			if (!knownIds.has(flow.id)) {
				extraFlows.push({
					id: flow.id,
					name: flow.name,
					description: flow.description,
					version: flow.version,
				});
			}
		}
		if (extraFlows.length > 0) {
			log.info(`Registry provided ${extraFlows.length} additional flow(s) not in flows.yml`);
		}
		return [...fileFlows, ...extraFlows];
	}

	/**
	 * Get list of all available flows
	 * Tries orchestrator first, falls back to local flows.yml
	 */
	async getFlowsList(): Promise<FlowListItem[]> {
		try {
			// Try getting from orchestrator first
			const flowsByProject = await this.getFlows();

			// Flatten into a list
			const flowList: FlowListItem[] = [];
			for (const projectId of Object.keys(flowsByProject)) {
				const projectFlows = flowsByProject[projectId];
				for (const [flowId, metadata] of Object.entries(projectFlows)) {
					flowList.push({
						id: flowId,
						name: metadata.name,
						description: metadata.description,
						version: metadata.version,
					});
				}
			}

			// If orchestrator has flows, return them
			if (flowList.length > 0) {
				return flowList;
			}

			// Fallback to local file, supplemented with registry flows not in the file
			const fileFlows = this.getFlowsListFromFile();
			return this.mergeWithRegistryFlows(fileFlows);
		} catch (error) {
			log.error('Error loading flows list from orchestrator, trying local file:', error);
			const fileFlows = this.getFlowsListFromFile();
			return this.mergeWithRegistryFlows(fileFlows);
		}
	}

	/**
	 * Get flows from local flows.yml file
	 */
	private getFlowsListFromFile(): FlowListItem[] {
		try {
			if (!fs.existsSync(this.flowsFilePath)) {
				log.info('Flows file not found:', this.flowsFilePath);
				return [];
			}

			const fileContents = fs.readFileSync(this.flowsFilePath, 'utf8');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const flows = yaml.load(fileContents) as Record<string, any>;

			const flowList: FlowListItem[] = [];
			for (const [id, flow] of Object.entries(flows)) {
				if (flow && typeof flow === 'object') {
					flowList.push({
						id,
						name: flow.name || id,
						description: flow.description || '',
						version: flow.version || '1.0.0',
					});
				}
			}

			log.info(`Loaded ${flowList.length} flows from local file`);
			return flowList;
		} catch (error) {
			log.error('Error loading flows from file:', error);
			return [];
		}
	}

	/**
	 * Get a specific flow definition by ID
	 * Requests the full definition from the worker via orchestrator
	 */
	async getFlowById(flowId: string): Promise<FlowDefinition | null> {
		// Get all flows to find which project the flow belongs to
		const flowsByProject = await this.getFlows();

		// Search for the flow across all projects
		for (const projectId of Object.keys(flowsByProject)) {
			const projectFlows = flowsByProject[projectId];
			if (projectFlows[flowId]) {
				// Found the flow - request full definition from worker
				log.info(` Requesting flow ${flowId} from project ${projectId}`);
				const flowDefinition = await this.orchestratorWrapper.requestFlowDefinition(projectId, flowId);
				return flowDefinition;
			}
		}

		// Flow not found via orchestrator — fall back to local flows.yml then registry
		log.warn(`Flow ${flowId} not found in any project, falling back to local file`);
		const fromFile = this.getFlowByIdFromFile(flowId);
		if (fromFile) {
			return fromFile;
		}

		// Last resort: check registry (covers custom flows approved at runtime)
		const fromRegistry = this.registry?.getFlow(flowId);
		if (fromRegistry) {
			log.info(` Flow ${flowId} found in registry (custom/approved flow)`);
			return fromRegistry;
		}

		return null;
	}

	/**
	 * Save a flow definition
	 * Sends the updated definition to the worker via orchestrator
	 */
	async saveFlow(flowId: string, flowDefinition: FlowDefinition): Promise<void> {
		try {
			// Get all flows to find which project the flow belongs to
			const flowsByProject = await this.getFlows();

			// Search for the flow across all projects
			for (const projectId of Object.keys(flowsByProject)) {
				const projectFlows = flowsByProject[projectId];
				if (projectFlows[flowId]) {
					// Found the flow - send save request to worker
					log.info(` Saving flow ${flowId} to project ${projectId}`);
					await this.orchestratorWrapper.saveFlowDefinition(projectId, flowId, flowDefinition);
					return;
				}
			}

			throw new Error(`Flow ${flowId} not found in any project`);
		} catch (error) {
			log.error(` Error saving flow ${flowId}:`, error);
			throw error;
		}
	}

	/**
	 * Get flow by ID from local flows.yml file
	 */
	private getFlowByIdFromFile(flowId: string): FlowDefinition | null {
		try {
			log.info(` Loading flow ${flowId} from ${this.flowsFilePath}`);

			if (!fs.existsSync(this.flowsFilePath)) {
				log.info(' File does not exist');
				return null;
			}

			const fileContents = fs.readFileSync(this.flowsFilePath, 'utf8');
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const flows = yaml.load(fileContents) as Record<string, any>;

			log.info(` Available flows:`, Object.keys(flows));

			const flow = flows[flowId];
			if (!flow) {
				log.info(` Flow ${flowId} not found in file`);
				return null;
			}

			log.info(` Found flow ${flowId}, returning definition`);

			return {
				id: flowId,
				version: flow.version || '1.0.0',
				name: flow.name || flowId,
				description: flow.description || '',
				workspace: flow.workspace,
				statusTransitions: flow.statusTransitions,
				inputs: flow.inputs,
				steps: flow.steps || [],
			};
		} catch (error) {
			log.error(` Error loading flow ${flowId} from file:`, error);
			return null;
		}
	}
}
