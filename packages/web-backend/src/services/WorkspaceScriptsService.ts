import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createLogger } from 'shared-common/logger';

import type {
	AvailableScript,
	CreateWorkspaceScript,
	ScriptProcessWithConfig,
	UpdateWorkspaceScript,
	WorkspaceScript,
} from '@app/shared/api/workspaceScripts.contract';
import {
	B2F_WORKSPACE_SCRIPT_CREATED,
	B2F_WORKSPACE_SCRIPT_DELETED,
	B2F_WORKSPACE_SCRIPT_UPDATED,
} from '@app/shared/transport';

import type { ScriptProcessRepository } from '../repositories/ScriptProcessRepository';
import type { WorkspaceScriptsRepository } from '../repositories/WorkspaceScriptsRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';
import type { WorkspacesService } from './WorkspacesService';

const log = createLogger('WorkspaceScriptsService');

/**
 * Maximum number of scripts allowed per workspace
 */
const MAX_SCRIPTS_PER_WORKSPACE = 10;

/**
 * ===========================================================================================
 * WORKSPACE SCRIPTS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workspace script configuration management.
 *
 * Responsibilities:
 * - CRUD operations for script configurations
 * - Script discovery from package.json
 * - Enforce max 10 scripts per workspace limit
 * - Emit B2F events for script lifecycle changes
 * - Combine script configs with process state for API responses
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Process management (in ScriptProcessService)
 * - Data storage (in repositories)
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 * - Type-safe event emission using EventBroadcaster
 *
 * CRUD Operations:
 * - createScript() → emit B2F_WORKSPACE_SCRIPT_CREATED
 * - updateScript() → emit B2F_WORKSPACE_SCRIPT_UPDATED
 * - deleteScript() → emit B2F_WORKSPACE_SCRIPT_DELETED
 *
 * ===========================================================================================
 */
export class WorkspaceScriptsService {
	constructor(
		private readonly workspaceScriptsRepository: WorkspaceScriptsRepository,
		private readonly scriptProcessRepository: ScriptProcessRepository,
		private readonly workspacesService: WorkspacesService,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

	/**
	 * Get all scripts for a workspace with their process state
	 */
	async getScriptsWithProcesses(workspaceId: string): Promise<ScriptProcessWithConfig[]> {
		try {
			log.info(`Getting scripts for workspace ${workspaceId}`);

			// Get all scripts for workspace
			const scripts = await this.workspaceScriptsRepository.findByWorkspace(workspaceId);

			// Get process state for each script
			const scriptsWithProcesses = await Promise.all(
				scripts.map(async script => {
					const process = await this.scriptProcessRepository.findByScriptId(script.id);
					return {
						script,
						process: process || undefined,
					};
				})
			);

			return scriptsWithProcesses;
		} catch (error) {
			log.error(`Failed to get scripts for workspace ${workspaceId}:`, error);
			throw error;
		}
	}

	/**
	 * Get a single script with its process state
	 */
	async getScriptWithProcess(workspaceId: string, scriptId: string): Promise<ScriptProcessWithConfig | null> {
		try {
			log.info(`Getting script ${scriptId} for workspace ${workspaceId}`);

			const script = await this.workspaceScriptsRepository.findById(scriptId);
			if (!script || script.workspaceId !== workspaceId) {
				return null;
			}

			const process = await this.scriptProcessRepository.findByScriptId(script.id);

			return {
				script,
				process: process || undefined,
			};
		} catch (error) {
			log.error(`Failed to get script ${scriptId}:`, error);
			throw error;
		}
	}

	/**
	 * Create a new script configuration
	 */
	async createScript(workspaceId: string, data: CreateWorkspaceScript): Promise<WorkspaceScript> {
		try {
			log.info(`Creating script "${data.scriptName}" for workspace ${workspaceId}`);

			// Check script limit
			const existingCount = await this.workspaceScriptsRepository.countByWorkspace(workspaceId);
			if (existingCount >= MAX_SCRIPTS_PER_WORKSPACE) {
				throw new Error(`Maximum ${MAX_SCRIPTS_PER_WORKSPACE} scripts allowed per workspace`);
			}

			// Check for duplicate script name
			const existing = await this.workspaceScriptsRepository.findByScriptName(workspaceId, data.scriptName);
			if (existing) {
				throw new Error(`Script "${data.scriptName}" already exists in this workspace`);
			}

			// Create script
			const script = await this.workspaceScriptsRepository.create({
				workspaceId,
				scriptName: data.scriptName,
				enabled: data.enabled ?? true,
				displayName: data.displayName,
				description: data.description,
				url: data.url,
				order: data.order ?? 0,
			});

			// Emit event after successful creation
			try {
				this.eventBroadcaster.broadcast(B2F_WORKSPACE_SCRIPT_CREATED, script);
			} catch (error) {
				log.error('Failed to broadcast script created event:', error);
			}

			log.info(`Created script ${script.id}`);
			return script;
		} catch (error) {
			log.error(`Failed to create script for workspace ${workspaceId}:`, error);
			throw error;
		}
	}

	/**
	 * Update an existing script configuration
	 */
	async updateScript(workspaceId: string, scriptId: string, data: UpdateWorkspaceScript): Promise<WorkspaceScript> {
		try {
			log.info(`Updating script ${scriptId}`);

			// Verify script exists and belongs to workspace
			const existing = await this.workspaceScriptsRepository.findById(scriptId);
			if (!existing || existing.workspaceId !== workspaceId) {
				throw new Error(`Script ${scriptId} not found in workspace ${workspaceId}`);
			}

			// Check optimistic locking version
			if (data.version !== existing.version) {
				throw new Error(
					`Version conflict: expected ${data.version}, current is ${existing.version}. The script was modified by another user.`
				);
			}

			// Check for duplicate script name if changing
			if (data.scriptName && data.scriptName !== existing.scriptName) {
				const duplicate = await this.workspaceScriptsRepository.findByScriptName(workspaceId, data.scriptName);
				if (duplicate) {
					throw new Error(`Script "${data.scriptName}" already exists in this workspace`);
				}
			}

			// Build update object - only include fields that are provided (not undefined)
			// This prevents overwriting existing fields with undefined values
			const updateData: Partial<WorkspaceScript> = {
				version: existing.version + 1,
			};

			if (data.scriptName !== undefined) updateData.scriptName = data.scriptName;
			if (data.enabled !== undefined) updateData.enabled = data.enabled;
			if (data.displayName !== undefined) updateData.displayName = data.displayName;
			if (data.description !== undefined) updateData.description = data.description;
			if (data.url !== undefined) updateData.url = data.url;
			if (data.order !== undefined) updateData.order = data.order;

			// Update script
			const script = await this.workspaceScriptsRepository.update(scriptId, updateData);

			// Emit event after successful update
			try {
				this.eventBroadcaster.broadcast(B2F_WORKSPACE_SCRIPT_UPDATED, script);
			} catch (error) {
				log.error('Failed to broadcast script updated event:', error);
			}

			log.info(`Updated script ${scriptId}`);
			return script;
		} catch (error) {
			log.error(`Failed to update script ${scriptId}:`, error);
			throw error;
		}
	}

	/**
	 * Delete a script configuration
	 */
	async deleteScript(workspaceId: string, scriptId: string): Promise<void> {
		try {
			log.info(`Deleting script ${scriptId}`);

			// Verify script exists and belongs to workspace
			const existing = await this.workspaceScriptsRepository.findById(scriptId);
			if (!existing || existing.workspaceId !== workspaceId) {
				throw new Error(`Script ${scriptId} not found in workspace ${workspaceId}`);
			}

			// Delete script
			await this.workspaceScriptsRepository.delete(scriptId);

			// Delete associated process if exists
			await this.scriptProcessRepository.deleteByScriptId(scriptId);

			// Emit event after successful deletion
			try {
				this.eventBroadcaster.broadcast(B2F_WORKSPACE_SCRIPT_DELETED, existing);
			} catch (error) {
				log.error('Failed to broadcast script deleted event:', error);
			}

			log.info(`Deleted script ${scriptId}`);
		} catch (error) {
			log.error(`Failed to delete script ${scriptId}:`, error);
			throw error;
		}
	}

	/**
	 * Discover available scripts from workspace package.json
	 */
	async discoverAvailableScripts(workspaceId: string): Promise<AvailableScript[]> {
		try {
			log.info(`Discovering available scripts for workspace ${workspaceId}`);

			// Get workspace to find path
			const workspacesData = await this.workspacesService.getWorkspacesData();
			const workspace = workspacesData.workspaces.find(w => w.id === workspaceId);

			if (!workspace) {
				throw new Error(`Workspace ${workspaceId} not found`);
			}

			// Read package.json from workspace path
			const packageJsonPath = path.join(workspace.path, 'package.json');
			log.debug(`Reading package.json from ${packageJsonPath}`);

			let packageJsonContent: string;
			try {
				packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
			} catch (error) {
				// Package.json doesn't exist or can't be read
				log.warn(`Could not read package.json from ${packageJsonPath}:`, error);
				return [];
			}

			// Parse package.json
			let packageJson: any;
			try {
				packageJson = JSON.parse(packageJsonContent);
			} catch (error) {
				log.error(`Failed to parse package.json from ${packageJsonPath}:`, error);
				throw new Error('Invalid package.json file');
			}

			// Extract scripts section
			const scripts = packageJson.scripts || {};

			// Convert to AvailableScript[] format
			const availableScripts: AvailableScript[] = Object.entries(scripts).map(([name, command]) => ({
				name,
				command: String(command),
			}));

			log.info(`Discovered ${availableScripts.length} scripts in workspace ${workspaceId}`);
			return availableScripts;
		} catch (error) {
			log.error(`Failed to discover scripts for workspace ${workspaceId}:`, error);
			throw error;
		}
	}
}
