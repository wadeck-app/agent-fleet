import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { createLogger } from 'shared-common/logger';

import type {
	CreateWorkspaceDto,
	UpdateWorkspaceDto,
	Workspace,
	WorkspacesData,
	WorkspacesListQuery,
	WorkspacesListResponse,
} from '@app/shared/api/workspaces.contract';
import { B2F_WORKSPACES_UPDATED, B2F_WORKSPACE_UPDATED } from '@app/shared/transport';

import type { ProjectsRepository } from '../repositories/ProjectsRepository';
import type { WorkspaceMetadataRepository } from '../repositories/WorkspaceMetadataRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import { WorkspaceCreationService } from './WorkspaceCreationService';
import { WorkspaceMapper } from './WorkspaceMapper';

const log = createLogger('WorkspacesService');

/**
 * ===========================================================================================
 * WORKSPACES SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workspace management.
 * Responsibilities:
 * - Generate mock workspace data (MVP - orchestrator doesn't have workspaces API yet)
 * - Calculate summary statistics
 * - Transform workspace data into frontend DTO
 * - Emit real-time events for workspace state changes
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Data fetching/caching (would be in repository when real API exists)
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 * - Type-safe event emission using EventBroadcaster
 *
 * Future CRUD Operations (when implemented):
 * - createWorkspace() → emit 'b2f:workspace:created'
 * - updateWorkspace() → emit 'b2f:workspace:updated'
 * - deleteWorkspace() → emit 'b2f:workspace:deleted'
 * - archiveWorkspace() → emit 'b2f:workspace:archived'
 * - checkQuota() → emit 'b2f:workspace:quota_exceeded' (when quota exceeded)
 *
 * ===========================================================================================
 */

export class WorkspacesService {
	private readonly creationService: WorkspaceCreationService;

	constructor(
		private readonly eventBroadcaster: EventBroadcaster,
		private readonly orchestratorWrapper: OrchestratorWrapper,
		private readonly metadataRepository: WorkspaceMetadataRepository,
		private readonly projectsRepository: ProjectsRepository
	) {
		this.creationService = new WorkspaceCreationService();

		// Configure metadata file watcher to emit B2F_WORKSPACES_UPDATED on changes
		this.metadataRepository.setChangeCallback((workspacePath: string) => {
			log.info(`Metadata changed for workspace: ${workspacePath}`);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {} as any);
		});
	}
	/**
	 * Deduplicate worker workspaces by path (multiple workers can work in same workspace)
	 */
	private deduplicateWorkspaces(
		workerWorkspaces: Array<{
			workerId: string;
			workspacePath: string;
			projectId: string;
			connectedAt: string;
		}>
	): Array<{
		workerId: string;
		workspacePath: string;
		projectId: string;
		connectedAt: string;
	}> {
		const pathMap = new Map<
			string,
			{
				workerId: string;
				workspacePath: string;
				projectId: string;
				connectedAt: string;
			}
		>();

		for (const workspace of workerWorkspaces) {
			const existing = pathMap.get(workspace.workspacePath);
			// Keep the one with most recent connectedAt
			if (!existing || workspace.connectedAt > existing.connectedAt) {
				pathMap.set(workspace.workspacePath, workspace);
			}
		}

		return Array.from(pathMap.values());
	}

	/**
	 * Build enrichment data for workspaces (activeWorkerId and projectId)
	 */
	private async buildEnrichmentData(
		workerWorkspaces: Array<{
			workerId: string;
			workspacePath: string;
			projectId: string;
			connectedAt: string;
		}>,
		uniqueWorkspaces: Array<{
			workerId: string;
			workspacePath: string;
			projectId: string;
			connectedAt: string;
		}>,
		metadataMap: Map<string, any>
	): Promise<{
		activeWorkerMap: Map<string, string>;
		projectMap: Map<string, string>;
	}> {
		const activeWorkerMap = new Map<string, string>();
		const projectMap = new Map<string, string>();

		// Build maps for all unique workspaces
		for (const workspace of uniqueWorkspaces) {
			const metadata = metadataMap.get(workspace.workspacePath);
			// Use metadata ID if available, otherwise use generated ID
			const workspaceId = metadata?.id || WorkspaceMapper.generateIdFromPath(workspace.workspacePath);

			// Find active worker: look for matching workspace in original workerWorkspaces
			const activeWorker = workerWorkspaces.find(w => {
				const wMetadata = metadataMap.get(w.workspacePath);
				const wId = wMetadata?.id || WorkspaceMapper.generateIdFromPath(w.workspacePath);
				return wId === workspaceId;
			});
			if (activeWorker) {
				activeWorkerMap.set(workspaceId, activeWorker.workerId);
			}

			// Find associated project via reverse lookup
			const project = await this.projectsRepository.getProjectForWorkspace(workspaceId);
			if (project) {
				projectMap.set(workspaceId, project.id);
			}
		}

		return { activeWorkerMap, projectMap };
	}

	/**
	 * Get workspaces data with summary statistics
	 */
	async getWorkspacesData(): Promise<WorkspacesData> {
		log.info('Fetching workspaces from connected workers...');

		try {
			// Fetch workspaces from connected workers
			const workerWorkspaces = await this.orchestratorWrapper.getConnectedWorkersWorkspaces();

			// Deduplicate by workspace path (multiple workers can work in same workspace)
			const uniqueWorkspaces = this.deduplicateWorkspaces(workerWorkspaces);

			// Fetch metadata for all workspace paths
			const workspacePaths = uniqueWorkspaces.map(w => w.workspacePath);
			const metadataMap = await this.metadataRepository.getMetadataForWorkspaces(workspacePaths);

			// Build enrichment data (activeWorkerId and projectId)
			const enrichmentData = await this.buildEnrichmentData(workerWorkspaces, uniqueWorkspaces, metadataMap);

			// Map to API format
			const workspaces = WorkspaceMapper.mapWorkerWorkspacesToApi(uniqueWorkspaces, metadataMap, enrichmentData);

			// Calculate summary statistics
			const summary = this.calculateSummary(workspaces);

			return {
				timestamp: new Date().toISOString(),
				summary,
				workspaces,
			};
		} catch (error) {
			log.error('Failed to fetch workspaces:', error);
			// Return empty data on error
			return {
				timestamp: new Date().toISOString(),
				summary: {
					total: 0,
					active: 0,
					locked: 0,
					cleaning: 0,
					errorCount: 0,
				},
				workspaces: [],
			};
		}
	}

	/**
	 * Get workspaces list with pagination, sorting, and search support
	 * (Data2 architecture)
	 */
	async getWorkspacesList(query: WorkspacesListQuery): Promise<WorkspacesListResponse> {
		log.info('Fetching workspaces list from connected workers...');

		try {
			// Fetch workspaces from connected workers
			const workerWorkspaces = await this.orchestratorWrapper.getConnectedWorkersWorkspaces();

			// Deduplicate by workspace path (multiple workers can work in same workspace)
			const uniqueWorkspaces = this.deduplicateWorkspaces(workerWorkspaces);

			// Fetch metadata for all workspace paths
			const workspacePaths = uniqueWorkspaces.map(w => w.workspacePath);
			const metadataMap = await this.metadataRepository.getMetadataForWorkspaces(workspacePaths);

			// Start watching metadata files for all connected workspaces
			for (const workspacePath of workspacePaths) {
				this.metadataRepository.startWatching(workspacePath);
			}

			// Build enrichment data (activeWorkerId and projectId)
			const enrichmentData = await this.buildEnrichmentData(workerWorkspaces, uniqueWorkspaces, metadataMap);

			// Map to API format
			let workspaces = WorkspaceMapper.mapWorkerWorkspacesToApi(uniqueWorkspaces, metadataMap, enrichmentData);

			// Apply domain filters (status, mode)
			if (query.status) {
				workspaces = workspaces.filter(w => w.status === query.status);
			}
			if (query.mode) {
				workspaces = workspaces.filter(w => w.mode === query.mode);
			}

			// Apply search if provided
			if (query.search) {
				workspaces = this.applySearch(workspaces, query.search);
			}

			// Apply sorting if provided
			if (query.sortBy && query.sortOrder) {
				workspaces = this.applySorting(workspaces, query.sortBy, query.sortOrder);
			}

			// Apply pagination
			const page = query.page || 1;
			const pageSize = query.pageSize || 10;
			const total = workspaces.length;
			const totalPages = Math.ceil(total / pageSize);
			const start = (page - 1) * pageSize;
			const paginatedWorkspaces = workspaces.slice(start, start + pageSize);

			return {
				items: paginatedWorkspaces,
				pagination: {
					total,
					page,
					pageSize,
					totalPages,
				},
			};
		} catch (error) {
			log.error('Failed to fetch workspaces list:', error);
			// Return empty list on error
			return {
				items: [],
				pagination: {
					total: 0,
					page: query.page || 1,
					pageSize: query.pageSize || 10,
					totalPages: 0,
				},
			};
		}
	}

	/**
	 * Apply search filter across workspace fields (including metadata)
	 */
	private applySearch(workspaces: Workspace[], searchQuery: string): Workspace[] {
		const lowerQuery = searchQuery.toLowerCase().trim();
		if (!lowerQuery) return workspaces;

		return workspaces.filter(
			w =>
				w.id.toLowerCase().includes(lowerQuery) ||
				w.path.toLowerCase().includes(lowerQuery) ||
				w.mode.toLowerCase().includes(lowerQuery) ||
				w.status.toLowerCase().includes(lowerQuery) ||
				w.gitBranch?.toLowerCase().includes(lowerQuery) ||
				w.name?.toLowerCase().includes(lowerQuery) ||
				w.description?.toLowerCase().includes(lowerQuery)
		);
	}

	/**
	 * Apply sorting to workspaces
	 */
	private applySorting(workspaces: Workspace[], sortBy: string, sortOrder: string): Workspace[] {
		const isDescending = sortOrder === 'desc';

		return [...workspaces].sort((a, b) => {
			const aVal = (a as any)[sortBy];
			const bVal = (b as any)[sortBy];

			if (aVal === null || aVal === undefined) return 1;
			if (bVal === null || bVal === undefined) return -1;

			let comparison = 0;
			if (typeof aVal === 'string' && typeof bVal === 'string') {
				comparison = aVal.localeCompare(bVal);
			} else if (typeof aVal === 'number' && typeof bVal === 'number') {
				comparison = aVal - bVal;
			} else {
				comparison = String(aVal).localeCompare(String(bVal));
			}

			return isDescending ? -comparison : comparison;
		});
	}

	/**
	 * Calculate summary statistics from workspace list
	 * @param workspaces - Array of workspaces
	 */
	private calculateSummary(workspaces: Workspace[]): {
		total: number;
		active: number;
		locked: number;
		cleaning: number;
		errorCount: number;
	} {
		const summary = {
			total: workspaces.length,
			active: 0,
			locked: 0,
			cleaning: 0,
			errorCount: 0,
		};

		// Count workspaces by status
		workspaces.forEach(workspace => {
			switch (workspace.status) {
				case 'active':
					summary.active++;
					break;
				case 'locked':
					summary.locked++;
					break;
				case 'cleaning':
					summary.cleaning++;
					break;
				case 'error':
					summary.errorCount++;
					break;
			}
		});

		return summary;
	}

	// ===========================================================================================
	// CRUD METHODS (TO BE IMPLEMENTED)
	// ===========================================================================================
	// When CRUD operations are implemented, use these as templates for event emission

	/**
	 * Create a new workspace (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:workspace:created' event
	 *
	 * @example
	 * ```typescript
	 * async createWorkspace(data: CreateWorkspaceDto): Promise<Workspace> {
	 *   try {
	 *     const workspace = await this.repository.createWorkspace(data);
	 *
	 *     // Emit event AFTER successful creation
	 *     this.eventBroadcaster.broadcast('b2f:workspace:created', workspace);
	 *
	 *     return workspace;
	 *   } catch (error) {
	 *     console.error('[WorkspacesService] Failed to create workspace:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Create a new workspace
	 * Emits 'b2f:workspaces:updated' event after successful creation
	 */
	async createWorkspace(data: CreateWorkspaceDto): Promise<Workspace> {
		log.info('Creating workspace', { path: data.path });

		try {
			// Create workspace using creation service
			const workspace = await this.creationService.createWorkspace(data);

			// Start watching metadata file
			this.metadataRepository.startWatching(data.path);

			// Emit event AFTER successful creation
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_WORKSPACES_UPDATED, {} as any);

			log.info('Successfully created workspace', { id: workspace.id });
			return workspace;
		} catch (error) {
			log.error('Failed to create workspace:', error);
			throw error;
		}
	}

	/**
	 * Update workspace metadata (name, description, color)
	 * Emits 'b2f:workspace:updated' event after successful update
	 * Note: Project association is now managed via Projects API (PATCH /api/projects/:id)
	 */
	async updateWorkspace(workspaceId: string, data: UpdateWorkspaceDto): Promise<Workspace> {
		log.info(`Updating workspace ${workspaceId}`, { data });

		try {
			// Find workspace by ID among connected workers
			const workerWorkspaces = await this.orchestratorWrapper.getConnectedWorkersWorkspaces();

			// Try to find workspace by metadata ID or generated ID
			const workspacePaths = workerWorkspaces.map(w => w.workspacePath);
			const metadataMap = await this.metadataRepository.getMetadataForWorkspaces(workspacePaths);

			let targetWorkspacePath: string | null = null;

			// Check metadata IDs first
			for (const [path, metadata] of metadataMap.entries()) {
				if (metadata.id === workspaceId) {
					targetWorkspacePath = path;
					break;
				}
			}

			// If not found in metadata, check generated IDs from paths
			if (!targetWorkspacePath) {
				for (const workerWorkspace of workerWorkspaces) {
					const generatedId = WorkspaceMapper.generateIdFromPath(workerWorkspace.workspacePath);
					if (generatedId === workspaceId) {
						targetWorkspacePath = workerWorkspace.workspacePath;
						break;
					}
				}
			}

			if (!targetWorkspacePath) {
				throw new Error(`Workspace ${workspaceId} not found`);
			}

			// Update metadata
			const metadata = await this.metadataRepository.upsertMetadata(targetWorkspacePath, {
				name: data.name,
				description: data.description,
				color: data.color,
			});

			// Start watching the metadata file if not already watching
			this.metadataRepository.startWatching(targetWorkspacePath);

			// Find the worker workspace info
			const workerWorkspace = workerWorkspaces.find(w => w.workspacePath === targetWorkspacePath);
			if (!workerWorkspace) {
				throw new Error(`Workspace ${workspaceId} not found among connected workers`);
			}

			// Build enrichment data for this workspace
			const enrichmentData = await this.buildEnrichmentData(workerWorkspaces, [workerWorkspace], metadataMap);
			const activeWorkerId = enrichmentData.activeWorkerMap.get(workspaceId);
			const projectId = enrichmentData.projectMap.get(workspaceId);

			// Map to API format with updated metadata
			const workspace = WorkspaceMapper.mapWorkerWorkspaceToApi(
				workerWorkspace,
				metadata,
				activeWorkerId,
				projectId
			);

			// Emit event AFTER successful update
			this.eventBroadcaster.broadcast(B2F_WORKSPACE_UPDATED, workspace);

			log.info(`Successfully updated workspace ${workspaceId}`);
			return workspace;
		} catch (error) {
			log.error(`Failed to update workspace ${workspaceId}:`, error);
			throw error;
		}
	}

	/**
	 * Archive workspace (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:workspace:archived' event
	 *
	 * @example
	 * ```typescript
	 * async archiveWorkspace(workspaceId: string): Promise<Workspace> {
	 *   try {
	 *     const archivedAt = Date.now();
	 *     const workspace = await this.repository.archiveWorkspace(workspaceId);
	 *
	 *     // Emit event AFTER successful archival
	 *     this.eventBroadcaster.broadcast('b2f:workspace:archived', {
	 *       workspaceId,
	 *       archivedAt,
	 *     });
	 *
	 *     return workspace;
	 *   } catch (error) {
	 *     console.error('[WorkspacesService] Failed to archive workspace:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Check workspace quota (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:workspace:quota_exceeded' event when quota is exceeded
	 *
	 * @example
	 * ```typescript
	 * async checkQuota(workspaceId: string, quotaType: string): Promise<boolean> {
	 *   try {
	 *     const quota = await this.repository.getWorkspaceQuota(workspaceId, quotaType);
	 *
	 *     if (quota.usage >= quota.limit) {
	 *       // Emit event when quota is exceeded
	 *       this.eventBroadcaster.broadcast('b2f:workspace:quota_exceeded', {
	 *         workspaceId,
	 *         quotaType,
	 *         usage: quota.usage,
	 *         limit: quota.limit,
	 *       });
	 *
	 *       return true; // Quota exceeded
	 *     }
	 *
	 *     return false; // Within quota
	 *   } catch (error) {
	 *     console.error('[WorkspacesService] Failed to check quota:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Delete workspace (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:workspace:deleted' event
	 *
	 * @example
	 * ```typescript
	 * async deleteWorkspace(workspaceId: string): Promise<void> {
	 *   try {
	 *     await this.repository.deleteWorkspace(workspaceId);
	 *
	 *     // Emit event AFTER successful deletion
	 *     this.eventBroadcaster.broadcast('b2f:workspace:deleted', {
	 *       id: workspaceId,
	 *       deletedAt: Date.now(),
	 *     } as any); // Type assertion needed as Workspace requires all fields
	 *
	 *   } catch (error) {
	 *     console.error('[WorkspacesService] Failed to delete workspace:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */
}
