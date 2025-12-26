import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';

import type { FlowMetadata, FlowsByProject } from '@app/shared/api/flows.contract';

import type { EventBroadcaster } from '../transport/EventBroadcaster';

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
	constructor(
		private readonly orchestratorWrapper: OrchestratorWrapper,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

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
}
