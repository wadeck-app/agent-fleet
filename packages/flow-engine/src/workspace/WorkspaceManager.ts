/**
 * Workspace Manager
 *
 * Thin orchestrator for workspace lifecycle: creation, allocation, tracking, and cleanup.
 * Git operations are delegated to WorkspaceGitStrategy.
 * Disk pruning is delegated to WorkspacePruner.
 */
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import type { Workspace, WorkspaceConfig } from '../types';
import { WorkspaceGitStrategy } from './WorkspaceGitStrategy';
import { pruneWorkspaceDirAtStartup, pruneWorkspaces } from './WorkspacePruner';
import { WorkspaceAllocationError } from './WorkspaceTypes';

// Re-exported for backward compatibility — definition lives in WorkspaceTypes.ts
export { WorkspaceAllocationError };

export interface WorkspaceAllocationOptions {
	taskId: string;
	config: WorkspaceConfig;
	basePath?: string;
	gitBranch?: string;
	existingPath?: string;
	taskMetadata?: Record<string, unknown>;
	autoCreate?: boolean;
}

export class WorkspaceManager {
	private workspaces: Map<string, Workspace> = new Map();
	private workspacesByTask: Map<string, string> = new Map();
	private basePath: string;
	private git: WorkspaceGitStrategy;

	constructor(private readonly projectRoot: string) {
		this.basePath = path.join(projectRoot, '.agent-fleet', 'workspaces');
		this.git = new WorkspaceGitStrategy(projectRoot);
		if (!fs.existsSync(this.basePath)) {
			fs.mkdirSync(this.basePath, { recursive: true });
		}
	}

	public async allocate(options: WorkspaceAllocationOptions): Promise<Workspace> {
		const { taskId, config, gitBranch = 'main', existingPath, taskMetadata = {}, autoCreate = true } = options;

		if (this.workspacesByTask.has(taskId)) {
			const ws = this.workspaces.get(this.workspacesByTask.get(taskId)!);
			if (ws) return ws;
		}

		if (config.mode === 'manual') {
			if (!existingPath) throw new WorkspaceAllocationError('Manual mode requires existingPath');
			return this.allocateManual(taskId, existingPath, config);
		}

		if (config.mode === 'shared') {
			if (config.reusePolicy !== 'never') {
				const reusable = await this.findReusable(taskId, config, gitBranch);
				if (reusable) {
					console.log(`Reusing shared workspace ${reusable.id} for execution ${taskId}`);
					return reusable;
				}
			}
			if (config.reusePolicy === 'never' || autoCreate) {
				return this.createWorkspace(taskId, 'shared', config, gitBranch, taskMetadata);
			}
		}

		if (config.mode === 'isolated') {
			return this.createWorkspace(taskId, 'isolated', config, gitBranch, taskMetadata);
		}

		throw new WorkspaceAllocationError(`Unsupported workspace mode: ${config.mode}`);
	}

	public async release(workspaceId: string, taskId: string): Promise<void> {
		const workspace = this.workspaces.get(workspaceId);
		if (!workspace) {
			console.warn(`Attempted to release non-existent workspace: ${workspaceId}`);
			return;
		}
		workspace.concurrency.activeTasks.delete(taskId);
		this.workspacesByTask.delete(taskId);
		console.log(
			`Released workspace ${workspaceId} from task ${taskId}. Active tasks: ${workspace.concurrency.activeTasks.size}`
		);
		if (workspace.mode === 'isolated' && workspace.concurrency.activeTasks.size === 0) {
			await this.cleanup(workspaceId);
		}
	}

	public async cleanup(workspaceId: string): Promise<void> {
		const workspace = this.workspaces.get(workspaceId);
		if (!workspace) return;
		console.log(`Cleaning up workspace ${workspaceId} (mode: ${workspace.mode})`);
		if (workspace.mode === 'manual') {
			this.deregister(workspaceId);
			return;
		}
		const isWorktree = await this.git.isWorktree(workspace.path);
		if (isWorktree) {
			try {
				await this.git.removeWorktree(workspace.path);
				console.log(`Removed worktree at ${workspace.path}`);
			} catch (error) {
				console.error(`Failed to remove worktree: ${error}`);
				this.removeDirSafe(workspace.path);
			}
		} else {
			this.removeDirSafe(workspace.path);
		}
		this.deregister(workspaceId);
	}

	public async pruneOldWorkspaces(config: { retainDays: number; maxWorkspaces: number }): Promise<void> {
		await pruneWorkspaces(this.basePath, config, this.workspaces);
	}

	public async cleanupAll(): Promise<void> {
		console.log(`Cleaning up all ${this.workspaces.size} workspaces`);
		for (const id of Array.from(this.workspaces.keys())) {
			await this.cleanup(id);
			await new Promise(resolve => setTimeout(resolve, 50));
		}
	}

	public getWorkspace(workspaceId: string): Workspace | undefined {
		return this.workspaces.get(workspaceId);
	}
	public getWorkspaceForTask(taskId: string): Workspace | undefined {
		const id = this.workspacesByTask.get(taskId);
		return id ? this.workspaces.get(id) : undefined;
	}
	public getAllWorkspaces(): Workspace[] {
		return Array.from(this.workspaces.values());
	}
	public isActive(workspaceId: string): boolean {
		return (this.workspaces.get(workspaceId)?.concurrency.activeTasks.size ?? 0) > 0;
	}
	public touch(workspaceId: string): void {
		const ws = this.workspaces.get(workspaceId);
		if (ws) {
			ws.lastUsedAt = new Date().toISOString();
			ws.usageCount++;
		}
	}
	public getBasePath(): string {
		return this.basePath;
	}
	public getStats() {
		const all = this.getAllWorkspaces();
		return {
			total: all.length,
			isolated: all.filter(w => w.mode === 'isolated').length,
			shared: all.filter(w => w.mode === 'shared').length,
			totalActiveTasks: all.reduce((s, w) => s + w.concurrency.activeTasks.size, 0),
		};
	}

	/** Static startup pruning — no active workspaces in memory yet. */
	public static pruneOldWorkspaceDir(basePath: string, retainDays: number, maxWorkspaces: number): void {
		pruneWorkspaceDirAtStartup(basePath, retainDays, maxWorkspaces);
	}

	// ── private helpers ──────────────────────────────────────────────────────

	private async findReusable(
		taskId: string,
		config: WorkspaceConfig,
		gitBranch: string
	): Promise<Workspace | undefined> {
		const key = config.concurrencyKey || 'default';
		for (const ws of this.workspaces.values()) {
			if (ws.mode !== 'shared') continue;
			if (ws.concurrency.key !== key) continue;
			if (ws.concurrency.locked) continue;
			if ((config.gitStrategy === 'main-only' || config.gitStrategy === 'any') && ws.git?.branch !== gitBranch)
				continue;
			ws.concurrency.activeTasks.add(taskId);
			ws.lastUsedAt = new Date().toISOString();
			ws.usageCount++;
			this.workspacesByTask.set(taskId, ws.id);
			return ws;
		}
		return undefined;
	}

	private async allocateManual(taskId: string, workspacePath: string, config: WorkspaceConfig): Promise<Workspace> {
		if (!fs.existsSync(workspacePath))
			throw new WorkspaceAllocationError(`Manual workspace path does not exist: ${workspacePath}`);
		const gitState = await this.git.getGitState(workspacePath);
		if (gitState && !gitState.isClean)
			console.warn(`⚠️  Manual workspace has uncommitted changes: ${workspacePath}`);
		if (!gitState) console.warn(`⚠️  Manual workspace is not a git repository: ${workspacePath}`);
		const id = uuidv4();
		const metaDir = workspacePath + '.meta';
		fs.mkdirSync(path.join(metaDir, 'outputs'), { recursive: true });
		const ws: Workspace = {
			id,
			path: workspacePath,
			metaDir,
			mode: 'manual',
			git: gitState,
			concurrency: { key: config.concurrencyKey || id, activeTasks: new Set([taskId]), locked: true },
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 1,
		};
		this.workspaces.set(id, ws);
		this.workspacesByTask.set(taskId, id);
		console.log(`Allocated manual workspace ${id} for execution ${taskId}`);
		return ws;
	}

	private async createWorkspace(
		taskId: string,
		mode: 'shared' | 'isolated',
		config: WorkspaceConfig,
		gitBranch: string,
		taskMetadata: Record<string, unknown>
	): Promise<Workspace> {
		const id = uuidv4();
		const prefix = mode === 'shared' ? 'shared' : 'isolated';
		const workspacePath = path.join(this.basePath, `${prefix}-${id}`);
		const metaDir = workspacePath + '.meta';
		try {
			fs.mkdirSync(workspacePath, { recursive: true });
			fs.mkdirSync(path.join(metaDir, 'outputs'), { recursive: true });
		} catch (error) {
			throw new WorkspaceAllocationError(`Failed to create workspace directory: ${error}`);
		}
		const gitState = await this.git.setupGit(workspacePath, config.gitStrategy, gitBranch, taskMetadata, taskId);
		const ws: Workspace = {
			id,
			path: workspacePath,
			metaDir,
			mode,
			git: gitState,
			concurrency: {
				key: config.concurrencyKey || (mode === 'shared' ? 'default' : id),
				activeTasks: new Set([taskId]),
				locked: mode === 'isolated',
			},
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 1,
		};
		this.workspaces.set(id, ws);
		this.workspacesByTask.set(taskId, id);
		console.log(`Created ${mode} workspace ${id} for execution ${taskId}`);
		return ws;
	}

	private deregister(workspaceId: string): void {
		this.workspaces.delete(workspaceId);
		for (const [taskId, wId] of this.workspacesByTask.entries()) {
			if (wId === workspaceId) this.workspacesByTask.delete(taskId);
		}
	}

	private removeDirSafe(dirPath: string): void {
		try {
			if (fs.existsSync(dirPath))
				fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
		} catch (error) {
			console.error(`Failed to remove workspace directory: ${error}`);
		}
	}
}
