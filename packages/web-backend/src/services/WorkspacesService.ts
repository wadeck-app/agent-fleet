import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { createLogger } from 'shared-common/logger';

import type {
	CreateWorkspaceDto,
	UpdateWorkspaceDto,
	Workspace,
	WorkspaceMetadataEntity,
	WorkspacesData,
	WorkspacesListQuery,
	WorkspacesListResponse,
} from '@app/shared/api/workspaces.contract';
import { B2F_WORKSPACES_UPDATED, B2F_WORKSPACE_UPDATED } from '@app/shared/transport';

import type { ProjectsRepository } from '../repositories/ProjectsRepository';
import type { WorkspaceMetadataRepository } from '../repositories/WorkspaceMetadataRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import { WorkspaceCreationService } from './WorkspaceCreationService';
import { WorkspaceGitService } from './WorkspaceGitService';
import { type WorkerInfo, WorkspaceMapper } from './WorkspaceMapper';
import { WorkspaceMetadataFile } from './WorkspaceMetadataFile';

const log = createLogger('WorkspacesService');

/**
 * ===========================================================================================
 * WORKSPACES SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workspace management.
 * Uses centralized WorkspaceMetadataRepository (data/workspaces.json).
 *
 * Key behaviors:
 * - All workspaces are always visible (idle when no worker connected, active when connected)
 * - Lazy migration: unknown worker paths auto-register from legacy metadata files
 * - No more FS watchers — centralized persistence via BaseRepository
 *
 * ===========================================================================================
 */

export class WorkspacesService {
	private readonly creationService: WorkspaceCreationService;
	private readonly gitService: WorkspaceGitService;
	private readonly legacyMetadataFile: WorkspaceMetadataFile;
	// Interim in-memory cache for newly created workspaces (safety net until DB migration lands)
	private readonly recentlyCreatedWorkspaces: Map<string, Workspace> = new Map();

	constructor(
		private readonly eventBroadcaster: EventBroadcaster,
		private readonly orchestratorWrapper: OrchestratorWrapper,
		private readonly metadataRepository: WorkspaceMetadataRepository,
		private readonly projectsRepository: ProjectsRepository
	) {
		this.creationService = new WorkspaceCreationService();
		this.gitService = new WorkspaceGitService();
		// Keep legacy reader for one-time migration of existing workspaces
		this.legacyMetadataFile = new WorkspaceMetadataFile();
	}

	/**
	 * Build worker info map from connected workers (keyed by workspace path)
	 */
	private async buildWorkerInfoMap(): Promise<Map<string, WorkerInfo>> {
		const workerWorkspaces = await this.orchestratorWrapper.getConnectedWorkersWorkspaces();
		const workerByPath = new Map<string, WorkerInfo>();

		for (const ww of workerWorkspaces) {
			const existing = workerByPath.get(ww.workspacePath);
			// Keep the most recently connected worker per path
			if (!existing || ww.connectedAt > existing.connectedAt) {
				workerByPath.set(ww.workspacePath, {
					workerId: ww.workerId,
					connectedAt: ww.connectedAt,
					gitBranch: ww.gitBranch,
				});
			}
		}

		return workerByPath;
	}

	/**
	 * Auto-register unknown worker paths into centralized store.
	 * Handles lazy migration from legacy .agent-fleet/workspace-metadata.json files.
	 */
	private async autoRegisterWorkerPaths(
		workerByPath: Map<string, WorkerInfo>,
		knownPaths: Set<string>
	): Promise<void> {
		for (const workerPath of workerByPath.keys()) {
			if (knownPaths.has(workerPath)) {
				continue;
			}

			try {
				// Try reading legacy metadata file
				const legacyData = await this.legacyMetadataFile.read(workerPath);
				if (legacyData) {
					log.info(`Migrating legacy workspace metadata for: ${workerPath}`);
					await this.metadataRepository.upsertByPath(workerPath, {
						name: legacyData.name,
						description: legacyData.description,
						color: legacyData.color,
						mode: legacyData.mode,
					});
				} else {
					// No legacy file — create with defaults
					await this.metadataRepository.ensureByPath(workerPath);
				}
			} catch (error) {
				log.error(`Failed to auto-register workspace path: ${workerPath}`, error);
			}
		}
	}

	/**
	 * Merge recently created workspaces into the result if not already present.
	 * Cleans up entries once the centralized store tracks them.
	 * Interim safety net — will be removed when DB migration lands.
	 */
	private mergeRecentlyCreated(knownPaths: Set<string>, workspaces: Workspace[]): Workspace[] {
		// Clean up entries that the store already tracks
		for (const path of this.recentlyCreatedWorkspaces.keys()) {
			if (knownPaths.has(path)) {
				this.recentlyCreatedWorkspaces.delete(path);
			}
		}
		// Add remaining recently created workspaces
		for (const workspace of this.recentlyCreatedWorkspaces.values()) {
			if (!knownPaths.has(workspace.path)) {
				workspaces.push(workspace);
			}
		}
		return workspaces;
	}

	/**
	 * Build projectId lookup map for workspaces
	 */
	private async buildProjectMap(workspaceIds: string[]): Promise<Map<string, string>> {
		const projectMap = new Map<string, string>();
		for (const workspaceId of workspaceIds) {
			const project = await this.projectsRepository.getProjectForWorkspace(workspaceId);
			if (project) {
				projectMap.set(workspaceId, project.id);
			}
		}
		return projectMap;
	}

	/**
	 * Get workspaces data with summary statistics
	 */
	async getWorkspacesData(): Promise<WorkspacesData> {
		log.info('Fetching workspaces data...');

		try {
			// 1. Get connected workers info
			const workerByPath = await this.buildWorkerInfoMap();

			// 2. Get all centralized entities
			let entities = await this.metadataRepository.findAll();
			const knownPaths = new Set(entities.map(e => e.path));

			// 3. Auto-register unknown worker paths (lazy migration)
			await this.autoRegisterWorkerPaths(workerByPath, knownPaths);

			// Re-fetch if new entities were created
			if ([...workerByPath.keys()].some(p => !knownPaths.has(p))) {
				entities = await this.metadataRepository.findAll();
			}

			// 4. Build project map
			const projectMap = await this.buildProjectMap(entities.map(e => e.id));

			// 5. Lazy init: resolve git branches for entities without stored branch and no worker
			const lazyBranchMap = await this.resolveLazyGitBranches(entities, workerByPath);

			// 6. Map to API format
			const workspaces = entities.map(entity => {
				const lazyBranch = lazyBranchMap.get(entity.id);
				const effectiveEntity = lazyBranch ? { ...entity, gitBranch: lazyBranch } : entity;
				return WorkspaceMapper.mapEntityToApi(
					effectiveEntity,
					workerByPath.get(entity.path),
					projectMap.get(entity.id)
				);
			});

			// 7. Merge recently created workspaces (interim safety net)
			const entityPaths = new Set(entities.map(e => e.path));
			this.mergeRecentlyCreated(entityPaths, workspaces);

			// 8. Fire-and-forget: persist branch changes for future responses
			this.refreshGitBranchesAsync(entities, workerByPath, lazyBranchMap);

			// 9. Calculate summary
			const summary = this.calculateSummary(workspaces);

			return {
				timestamp: new Date().toISOString(),
				summary,
				workspaces,
			};
		} catch (error) {
			log.error('Failed to fetch workspaces:', error);
			return {
				timestamp: new Date().toISOString(),
				summary: { total: 0, active: 0, idle: 0, locked: 0, cleaning: 0, errorCount: 0 },
				workspaces: [],
			};
		}
	}

	/**
	 * Get workspaces list with pagination, sorting, and search support
	 */
	async getWorkspacesList(query: WorkspacesListQuery): Promise<WorkspacesListResponse> {
		log.info('Fetching workspaces list...');

		try {
			// 1. Get connected workers info
			const workerByPath = await this.buildWorkerInfoMap();

			// 2. Get all centralized entities
			let entities = await this.metadataRepository.findAll();
			const knownPaths = new Set(entities.map(e => e.path));

			// 3. Auto-register unknown worker paths (lazy migration)
			await this.autoRegisterWorkerPaths(workerByPath, knownPaths);

			// Re-fetch if new entities were created
			if ([...workerByPath.keys()].some(p => !knownPaths.has(p))) {
				entities = await this.metadataRepository.findAll();
			}

			// 4. Build project map
			const projectMap = await this.buildProjectMap(entities.map(e => e.id));

			// 5. Lazy init: resolve git branches for entities without stored branch and no worker
			const lazyBranchMap = await this.resolveLazyGitBranches(entities, workerByPath);

			// 6. Map to API format
			let workspaces = entities.map(entity => {
				const lazyBranch = lazyBranchMap.get(entity.id);
				const effectiveEntity = lazyBranch ? { ...entity, gitBranch: lazyBranch } : entity;
				return WorkspaceMapper.mapEntityToApi(
					effectiveEntity,
					workerByPath.get(entity.path),
					projectMap.get(entity.id)
				);
			});

			// 7. Merge recently created workspaces (interim safety net)
			const entityPaths = new Set(entities.map(e => e.path));
			this.mergeRecentlyCreated(entityPaths, workspaces);

			// 8. Fire-and-forget: persist branch changes for future responses
			this.refreshGitBranchesAsync(entities, workerByPath, lazyBranchMap);

			// Apply domain filters
			if (query.status) {
				workspaces = workspaces.filter(w => w.status === query.status);
			}
			if (query.mode) {
				workspaces = workspaces.filter(w => w.mode === query.mode);
			}

			// Apply search
			if (query.search) {
				workspaces = this.applySearch(workspaces, query.search);
			}

			// Apply sorting
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
				pagination: { total, page, pageSize, totalPages },
			};
		} catch (error) {
			log.error('Failed to fetch workspaces list:', error);
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
	 * Create a new workspace
	 * 1. Delegate filesystem + git to WorkspaceCreationService
	 * 2. Persist metadata via centralized repository
	 * 3. Map to API DTO and broadcast event
	 */
	async createWorkspace(data: CreateWorkspaceDto): Promise<Workspace> {
		log.info('Creating workspace', { path: data.path });

		try {
			// Resolve source workspace path for worktree strategy
			let resolvedPaths: { sourceWorkspacePath?: string } | undefined;
			if (data.gitOptions?.strategy === 'worktree' && data.gitOptions.sourceWorkspaceId) {
				const sourceWorkspacePath = await this.resolveWorkspacePath(data.gitOptions.sourceWorkspaceId);
				resolvedPaths = { sourceWorkspacePath };
			}

			// Create workspace directory + git operations
			const { path, gitBranch } = await this.creationService.createWorkspace(data, resolvedPaths);

			// Persist metadata in centralized store (include gitBranch if resolved)
			const entity = await this.metadataRepository.create({
				path,
				name: data.name,
				description: data.description,
				color: data.color,
				mode: data.mode || 'development',
				gitBranch,
			});

			// Map to API format (newly created → no worker connected yet → idle)
			// gitBranch is stored in entity so WorkspaceMapper uses entity.gitBranch as fallback
			const workspace = WorkspaceMapper.mapEntityToApi(entity);

			// Cache for interim visibility (safety net)
			this.recentlyCreatedWorkspaces.set(workspace.path, workspace);

			// Broadcast event
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
	 */
	async updateWorkspace(workspaceId: string, data: UpdateWorkspaceDto): Promise<Workspace> {
		log.info(`Updating workspace ${workspaceId}`, { data });

		try {
			// Find directly in centralized store
			const entity = await this.metadataRepository.findById(workspaceId);
			if (!entity) {
				throw new Error(`Workspace ${workspaceId} not found`);
			}

			// Update metadata
			const updated = await this.metadataRepository.update(workspaceId, {
				name: data.name,
				description: data.description,
				color: data.color,
			});

			// Enrich with worker info
			const workerByPath = await this.buildWorkerInfoMap();
			const workerInfo = workerByPath.get(updated.path);

			// Find project
			const project = await this.projectsRepository.getProjectForWorkspace(workspaceId);

			// Map to API format
			const workspace = WorkspaceMapper.mapEntityToApi(updated, workerInfo, project?.id);

			// Broadcast event
			this.eventBroadcaster.broadcast(B2F_WORKSPACE_UPDATED, workspace);

			log.info(`Successfully updated workspace ${workspaceId}`);
			return workspace;
		} catch (error) {
			log.error(`Failed to update workspace ${workspaceId}:`, error);
			throw error;
		}
	}

	/**
	 * Resolve a workspace ID to its filesystem path
	 */
	async resolveWorkspacePath(workspaceId: string): Promise<string> {
		const entity = await this.metadataRepository.findById(workspaceId);
		if (entity) {
			return entity.path;
		}
		throw new Error(`Source workspace not found: ${workspaceId}`);
	}

	/**
	 * Apply search filter across workspace fields
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
	 * Resolve git branches for entities that have no stored gitBranch and no connected worker.
	 * Reads the filesystem synchronously (awaited) so the current response can include the branch.
	 * Returns a map of entity ID → resolved branch name.
	 */
	private async resolveLazyGitBranches(
		entities: WorkspaceMetadataEntity[],
		workerByPath: Map<string, WorkerInfo>
	): Promise<Map<string, string>> {
		const needsLazyInit = entities.filter(e => !e.gitBranch && !workerByPath.has(e.path));
		if (needsLazyInit.length === 0) {
			return new Map();
		}

		const resolved = await Promise.all(
			needsLazyInit.map(async e => ({
				id: e.id,
				branch: (await this.gitService.getGitState(e.path))?.branch,
			}))
		);

		const map = new Map<string, string>();
		for (const { id, branch } of resolved) {
			if (branch && branch !== 'unknown') {
				map.set(id, branch);
			}
		}
		return map;
	}

	/**
	 * Fire-and-forget: persist gitBranch changes to the metadata store.
	 * - Worker gitBranch differs from entity → update
	 * - Lazy-resolved branch → persist for future responses
	 */
	private refreshGitBranchesAsync(
		entities: WorkspaceMetadataEntity[],
		workerByPath: Map<string, WorkerInfo>,
		lazyBranchMap: Map<string, string>
	): void {
		void (async () => {
			for (const entity of entities) {
				try {
					const workerBranch = workerByPath.get(entity.path)?.gitBranch;
					if (workerBranch && workerBranch !== entity.gitBranch) {
						await this.metadataRepository.update(entity.id, { gitBranch: workerBranch });
					} else if (lazyBranchMap.has(entity.id)) {
						await this.metadataRepository.update(entity.id, { gitBranch: lazyBranchMap.get(entity.id) });
					}
				} catch (error) {
					log.warn(`Failed to refresh gitBranch for workspace ${entity.id}`, error);
				}
			}
		})();
	}

	/**
	 * Calculate summary statistics from workspace list
	 */
	private calculateSummary(workspaces: Workspace[]): {
		total: number;
		active: number;
		idle: number;
		locked: number;
		cleaning: number;
		errorCount: number;
	} {
		const summary = {
			total: workspaces.length,
			active: 0,
			idle: 0,
			locked: 0,
			cleaning: 0,
			errorCount: 0,
		};

		for (const workspace of workspaces) {
			switch (workspace.status) {
				case 'active':
					summary.active++;
					break;
				case 'idle':
					summary.idle++;
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
		}

		return summary;
	}
}
