/**
 * Flow Discovery Registry
 *
 * Maintains a registry of which workers have which flows, enabling:
 * - Multi-project support (workers announce their project ID)
 * - Version management (track multiple versions of the same flow)
 * - Hash validation (ensure same version has same implementation)
 * - Task assignment based on flow availability
 */
import type { FlowMetadata } from 'flow-engine/types';

import type { EventSubscriptionRegistry } from './EventSubscriptionRegistry';

/**
 * Error thrown when two workers report the same flow version with different hashes
 */
export class FlowVersionMismatchError extends Error {
	constructor(
		public projectId: string,
		public flowId: string,
		public version: string,
		public existingHash: string,
		public newHash: string,
		public existingWorkerId: string,
		public newWorkerId: string
	) {
		super(
			`Flow version mismatch detected!\n` +
				`Project: ${projectId}\n` +
				`Flow: ${flowId}\n` +
				`Version: ${version}\n` +
				`Worker ${existingWorkerId} has hash: ${existingHash}\n` +
				`Worker ${newWorkerId} has hash: ${newHash}\n` +
				`This indicates the same version has different implementations!`
		);
		this.name = 'FlowVersionMismatchError';
	}
}

/**
 * Worker's flow registry entry
 */
interface WorkerFlowRegistry {
	workerId: string;
	projectId: string;
	workspacePath: string;
	connectedAt: Date;
	flows: FlowMetadata[];
}

/**
 * Flow version entry in the index
 */
interface FlowVersionEntry {
	workerId: string;
	version: string;
	hash: string;
	metadata: FlowMetadata;
	registeredAt: Date;
}

/**
 * Worker flow entry for query results
 */
export interface WorkerFlowEntry {
	workerId: string;
	version: string;
	hash: string;
	metadata: FlowMetadata;
}

/**
 * Flow Discovery Registry
 *
 * Maintains three indices for efficient querying:
 * 1. workers: Map<workerId, WorkerFlowRegistry> - All worker registrations
 * 2. flowVersionIndex: Map<"projectId:flowId:version", FlowVersionEntry> - Quick version lookup
 * 3. projectFlowIndex: Map<projectId, Map<flowId, FlowVersionEntry[]>> - Project-based queries
 */
export class FlowDiscoveryRegistry {
	private workers: Map<string, WorkerFlowRegistry> = new Map();
	private flowVersionIndex: Map<string, FlowVersionEntry> = new Map();
	private projectFlowIndex: Map<string, Map<string, FlowVersionEntry[]>> = new Map();

	constructor(private eventSubscriptionRegistry?: EventSubscriptionRegistry) {}

	/**
	 * Set event subscription registry (called after initialization)
	 */
	setEventSubscriptionRegistry(registry: EventSubscriptionRegistry): void {
		this.eventSubscriptionRegistry = registry;
	}

	/**
	 * Register a worker with its flows
	 *
	 * @throws FlowVersionMismatchError if version hash conflicts with existing registration
	 */
	registerWorker(workerId: string, projectId: string, workspacePath: string, flows: FlowMetadata[]): void {
		// Validate hash for each flow before registering
		for (const flow of flows) {
			const key = this.makeVersionKey(projectId, flow.id, flow.version);
			const existing = this.flowVersionIndex.get(key);

			if (existing && existing.hash !== flow.hash) {
				throw new FlowVersionMismatchError(
					projectId,
					flow.id,
					flow.version,
					existing.hash,
					flow.hash,
					existing.workerId,
					workerId
				);
			}
		}

		// Store worker registration
		this.workers.set(workerId, {
			workerId,
			projectId,
			workspacePath,
			connectedAt: new Date(),
			flows,
		});

		// Index flows
		this.indexFlows(workerId, projectId, flows);
	}

	/**
	 * Unregister a worker and clean up all its flow entries
	 */
	unregisterWorker(workerId: string): void {
		const worker = this.workers.get(workerId);
		if (!worker) {
			return;
		}

		// Remove from workers map
		this.workers.delete(workerId);

		// Remove from flowVersionIndex
		for (const flow of worker.flows) {
			const key = this.makeVersionKey(worker.projectId, flow.id, flow.version);
			const entry = this.flowVersionIndex.get(key);
			if (entry && entry.workerId === workerId) {
				this.flowVersionIndex.delete(key);
			}
		}

		// Remove from projectFlowIndex
		const projectFlows = this.projectFlowIndex.get(worker.projectId);
		if (projectFlows) {
			for (const flow of worker.flows) {
				const flowEntries = projectFlows.get(flow.id);
				if (flowEntries) {
					const filtered = flowEntries.filter(entry => entry.workerId !== workerId);
					if (filtered.length === 0) {
						projectFlows.delete(flow.id);
					} else {
						projectFlows.set(flow.id, filtered);
					}
				}
			}

			// Clean up empty project entry
			if (projectFlows.size === 0) {
				this.projectFlowIndex.delete(worker.projectId);
			}
		}

		// Unregister event subscriptions for this worker
		this.eventSubscriptionRegistry?.unregisterWorker(workerId);
	}

	/**
	 * Update a worker's flows
	 *
	 * This compares the new flow list with the existing one and updates indices accordingly.
	 *
	 * @throws FlowVersionMismatchError if version hash conflicts with existing registration
	 */
	updateWorkerFlows(workerId: string, flows: FlowMetadata[]): void {
		const worker = this.workers.get(workerId);
		if (!worker) {
			throw new Error(`Worker ${workerId} not registered`);
		}

		// Validate hash for each new flow
		for (const flow of flows) {
			const key = this.makeVersionKey(worker.projectId, flow.id, flow.version);
			const existing = this.flowVersionIndex.get(key);

			// Only check if it exists and belongs to a different worker
			if (existing && existing.workerId !== workerId && existing.hash !== flow.hash) {
				throw new FlowVersionMismatchError(
					worker.projectId,
					flow.id,
					flow.version,
					existing.hash,
					flow.hash,
					existing.workerId,
					workerId
				);
			}
		}

		// Build sets for comparison
		const oldFlowKeys = new Set(worker.flows.map(f => this.makeVersionKey(worker.projectId, f.id, f.version)));
		const newFlowKeys = new Set(flows.map(f => this.makeVersionKey(worker.projectId, f.id, f.version)));

		// Find removed flows
		const removedKeys = [...oldFlowKeys].filter(key => !newFlowKeys.has(key));
		const removedFlows = worker.flows.filter(f =>
			removedKeys.includes(this.makeVersionKey(worker.projectId, f.id, f.version))
		);

		// Remove old entries
		this.removeFlowsFromIndices(workerId, worker.projectId, removedFlows);

		// Update worker's flow list
		worker.flows = flows;

		// Re-index all flows (simpler than detecting adds/updates)
		this.indexFlows(workerId, worker.projectId, flows);
	}

	/**
	 * Find all workers that have a specific flow
	 *
	 * @param projectId - Project ID
	 * @param flowId - Flow ID
	 * @param version - Optional specific version (if not provided, returns all versions)
	 * @returns List of worker entries with the flow
	 */
	findWorkersWithFlow(projectId: string, flowId: string, version?: string): WorkerFlowEntry[] {
		const projectFlows = this.projectFlowIndex.get(projectId);
		if (!projectFlows) {
			return [];
		}

		const flowEntries = projectFlows.get(flowId);
		if (!flowEntries) {
			return [];
		}

		// Filter by version if specified
		const filtered = version ? flowEntries.filter(entry => entry.version === version) : flowEntries;

		// Convert to WorkerFlowEntry
		return filtered.map(entry => ({
			workerId: entry.workerId,
			version: entry.version,
			hash: entry.hash,
			metadata: entry.metadata,
		}));
	}

	/**
	 * Get the latest version of a flow in a project
	 *
	 * @param projectId - Project ID
	 * @param flowId - Flow ID
	 * @returns Latest version string, or undefined if flow not found
	 */
	getLatestVersion(projectId: string, flowId: string): string | undefined {
		const projectFlows = this.projectFlowIndex.get(projectId);
		if (!projectFlows) {
			return undefined;
		}

		const flowEntries = projectFlows.get(flowId);
		if (!flowEntries || flowEntries.length === 0) {
			return undefined;
		}

		// Get all unique versions
		const versions = [...new Set(flowEntries.map(entry => entry.version))];

		// Find latest using semver comparison
		return this.findLatestVersion(versions);
	}

	/**
	 * Get all registered projects
	 */
	getAllProjects(): string[] {
		return Array.from(this.projectFlowIndex.keys());
	}

	/**
	 * Find a flow by ID across all projects and return its metadata
	 * Used for task creation validation
	 *
	 * @param flowId - Flow ID to search for
	 * @returns Flow metadata from the first worker that has it, or undefined if not found
	 */
	getFlowMetadataById(flowId: string): FlowMetadata | undefined {
		// Search across all projects
		for (const projectFlows of this.projectFlowIndex.values()) {
			const flowEntries = projectFlows.get(flowId);
			if (flowEntries && flowEntries.length > 0) {
				// Return metadata from the first entry (any worker with this flow)
				return flowEntries[0].metadata;
			}
		}
		return undefined;
	}

	/**
	 * Get all flows for a project
	 *
	 * @returns Map of flowId to list of worker entries, or undefined if project not found
	 */
	getProjectFlows(projectId: string): Map<string, WorkerFlowEntry[]> | undefined {
		const projectFlows = this.projectFlowIndex.get(projectId);
		if (!projectFlows) {
			return undefined;
		}

		const result = new Map<string, WorkerFlowEntry[]>();
		for (const [flowId, entries] of projectFlows) {
			result.set(
				flowId,
				entries.map(entry => ({
					workerId: entry.workerId,
					version: entry.version,
					hash: entry.hash,
					metadata: entry.metadata,
				}))
			);
		}

		return result;
	}

	/**
	 * Get flows for a specific worker
	 */
	getWorkerFlows(workerId: string): FlowMetadata[] | undefined {
		const worker = this.workers.get(workerId);
		return worker?.flows;
	}

	/**
	 * Check if a worker is registered
	 */
	hasWorker(workerId: string): boolean {
		return this.workers.has(workerId);
	}

	/**
	 * Get worker info (for testing/debugging)
	 */
	getWorker(workerId: string): WorkerFlowRegistry | undefined {
		return this.workers.get(workerId);
	}

	/**
	 * Private helper: Index flows for a worker
	 */
	private indexFlows(workerId: string, projectId: string, flows: FlowMetadata[]): void {
		const now = new Date();

		for (const flow of flows) {
			const key = this.makeVersionKey(projectId, flow.id, flow.version);
			const entry: FlowVersionEntry = {
				workerId,
				version: flow.version,
				hash: flow.hash,
				metadata: flow,
				registeredAt: now,
			};

			// Update flowVersionIndex (only set if not exists - serves as hash reference)
			if (!this.flowVersionIndex.has(key)) {
				this.flowVersionIndex.set(key, entry);
			}

			// Update projectFlowIndex
			let projectFlows = this.projectFlowIndex.get(projectId);
			if (!projectFlows) {
				projectFlows = new Map();
				this.projectFlowIndex.set(projectId, projectFlows);
			}

			let flowEntries = projectFlows.get(flow.id);
			if (!flowEntries) {
				flowEntries = [];
				projectFlows.set(flow.id, flowEntries);
			}

			// Remove existing entry for this worker (if updating)
			const filtered = flowEntries.filter(e => e.workerId !== workerId || e.version !== flow.version);
			filtered.push(entry);
			projectFlows.set(flow.id, filtered);

			// Register event trigger subscription if flow has one
			if (flow.trigger?.type === 'event' && this.eventSubscriptionRegistry) {
				const worker = this.workers.get(workerId);
				if (worker) {
					this.eventSubscriptionRegistry.register({
						workerId,
						flowId: flow.id,
						projectId,
						event: flow.trigger.event,
						filter: flow.trigger.filter,
					});
				}
			}
		}
	}

	/**
	 * Private helper: Remove flows from indices
	 */
	private removeFlowsFromIndices(workerId: string, projectId: string, flows: FlowMetadata[]): void {
		for (const flow of flows) {
			const key = this.makeVersionKey(projectId, flow.id, flow.version);
			const entry = this.flowVersionIndex.get(key);
			if (entry && entry.workerId === workerId) {
				this.flowVersionIndex.delete(key);
			}

			const projectFlows = this.projectFlowIndex.get(projectId);
			if (projectFlows) {
				const flowEntries = projectFlows.get(flow.id);
				if (flowEntries) {
					const filtered = flowEntries.filter(e => e.workerId !== workerId || e.version !== flow.version);
					if (filtered.length === 0) {
						projectFlows.delete(flow.id);
					} else {
						projectFlows.set(flow.id, filtered);
					}
				}
			}
		}
	}

	/**
	 * Private helper: Make version key for flowVersionIndex
	 */
	private makeVersionKey(projectId: string, flowId: string, version: string): string {
		return `${projectId}:${flowId}:${version}`;
	}

	/**
	 * Private helper: Find latest version from a list using semver comparison
	 */
	private findLatestVersion(versions: string[]): string {
		if (versions.length === 0) {
			throw new Error('Cannot find latest version from empty list');
		}

		if (versions.length === 1) {
			return versions[0];
		}

		// Sort versions using semver comparison
		const sorted = [...versions].sort(this.compareVersions);

		// Return the highest version (last in sorted array)
		return sorted[sorted.length - 1];
	}

	/**
	 * Private helper: Compare two semantic versions
	 *
	 * Returns:
	 * - negative if v1 < v2
	 * - 0 if v1 === v2
	 * - positive if v1 > v2
	 */
	private compareVersions(v1: string, v2: string): number {
		const parts1 = v1.split('.').map(Number);
		const parts2 = v2.split('.').map(Number);

		for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
			const part1 = parts1[i] || 0;
			const part2 = parts2[i] || 0;

			if (part1 !== part2) {
				return part1 - part2;
			}
		}

		return 0;
	}

	/**
	 * Parse a flow reference that may include a version specifier
	 * Supports formats:
	 * - "flowId" -> { id: "flowId", version: undefined }
	 * - "flowId@version" -> { id: "flowId", version: "version" }
	 *
	 * @param flowRef - Flow reference string (e.g., "my-flow" or "my-flow@1.0.0")
	 * @returns Object with id and optional version
	 */
	parseFlowReference(flowRef: string): { id: string; version?: string } {
		const atIndex = flowRef.lastIndexOf('@');
		if (atIndex === -1) {
			return { id: flowRef };
		}

		return {
			id: flowRef.substring(0, atIndex),
			version: flowRef.substring(atIndex + 1),
		};
	}
}
