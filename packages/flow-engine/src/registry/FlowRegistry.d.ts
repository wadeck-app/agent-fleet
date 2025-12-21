/**
 * Flow Registry
 *
 * Manages flow definitions, loading, validation, and lookup.
 * Provides default flows and supports project-specific flow configurations.
 */
import type { FlowDefinition } from '../types.js';
import type { ValidationResult } from '../validation/FlowValidator.js';

/**
 * Validation error for flow definitions
 */
export declare class FlowValidationError extends Error {
	flowId: string;
	constructor(flowId: string, message: string);
}
/**
 * Flow Registry manages all available flows
 */
export declare class FlowRegistry {
	private flows;
	private configPath;
	private validator;
	private watcher;
	private reloadTimeout;
	private externalFiles;
	/**
	 * Create a new flow registry
	 * @param projectRoot - Root directory of the project
	 */
	constructor(projectRoot: string);
	/**
	 * Load default flows into the registry
	 */
	private loadDefaultFlows;
	/**
	 * Load flows from project configuration file
	 * @throws Error if file cannot be read or parsed
	 */
	loadProjectFlows(): Promise<void>;
	/**
	 * Parse raw YAML data into a FlowDefinition
	 */
	private parseFlowDefinition;
	/**
	 * Load and parse an external flow file
	 * @param sourcePath - Relative path to external file (must be sibling of flows.yml)
	 * @param flowId - Flow ID being loaded (for error messages)
	 * @returns Parsed YAML content
	 * @throws Error if file doesn't exist, is outside allowed directory, or parse fails
	 */
	private loadExternalFlowFile;
	/**
	 * Validate external file path for security
	 * Must be a sibling file (no directory traversal)
	 * @throws Error if path is invalid or unsafe
	 */
	private validateExternalFilePath;
	/**
	 * Merge flow definitions: local fields override external fields
	 * Deep merge for nested objects like workspace, inputs, hooks
	 * @param external - Base definition from external file
	 * @param local - Override definition from flows.yml
	 * @returns Merged definition
	 */
	private mergeFlowDefinitions;
	/**
	 * Track an external file for hot-reload
	 * @param absolutePath - Absolute path to external file
	 */
	private trackExternalFile;
	/**
	 * Parse workspace configuration
	 */
	private parseWorkspaceConfig;
	/**
	 * Parse a single flow step
	 * Supports 'model', 'script', and 'subflow' step types
	 */
	private parseFlowStep;
	/**
	 * Validate a flow definition using the new validator
	 * @returns Validation result with detailed errors
	 */
	validateFlow(flow: FlowDefinition): ValidationResult;
	/**
	 * Get a flow by ID
	 * @param id - Flow identifier
	 * @returns Flow definition or undefined if not found
	 */
	getFlow(id: string): FlowDefinition | undefined;
	/**
	 * Get all registered flows
	 * @returns Array of all flow definitions
	 */
	getAllFlows(): FlowDefinition[];
	/**
	 * Check if a flow exists
	 * @param id - Flow identifier
	 * @returns True if flow exists
	 */
	hasFlow(id: string): boolean;
	/**
	 * Get list of available flow IDs
	 * @returns Array of flow IDs
	 */
	getFlowIds(): string[];
	/**
	 * Register a new flow programmatically
	 * @param flow - Flow definition to register
	 * @throws FlowValidationError if validation fails
	 */
	registerFlow(flow: FlowDefinition): void;
	/**
	 * Remove a flow from the registry
	 * @param id - Flow identifier
	 * @returns True if flow was removed
	 */
	unregisterFlow(id: string): boolean;
	/**
	 * Get flows by workspace mode
	 * @param mode - Workspace mode to filter by
	 * @returns Array of matching flows
	 */
	getFlowsByWorkspaceMode(mode: 'isolated' | 'shared'): FlowDefinition[];
	/**
	 * Clear all flows (except defaults if specified)
	 * @param keepDefaults - If true, keep default flows
	 */
	clear(keepDefaults?: boolean): void;
	/**
	 * Start watching the flows configuration file for changes
	 * Automatically reloads flows when the file is modified
	 */
	startWatching(): void;
	/**
	 * Watch all tracked external flow files
	 */
	private watchExternalFiles;
	/**
	 * Schedule a debounced reload
	 */
	private scheduleReload;
	/**
	 * Stop watching the flows configuration file
	 */
	stopWatching(): void;
	/**
	 * Reload flows from the configuration file
	 * Clears existing project flows and reloads them, keeping default flows
	 */
	private reloadFlows;
	/**
	 * Validate semantic version format
	 * Accepts formats like: "1.0.0", "2.1.3", "0.0.1"
	 * @param version - Version string to validate
	 * @returns True if valid semver format
	 */
	private isValidSemver;
	/**
	 * Compute a deterministic hash of flow content
	 * Hash includes: steps, workspace config, and inputs
	 * Hash excludes: id, name, description, hooks, statusTransitions
	 * @param flow - Flow definition to hash
	 * @returns 8-character hex digest of SHA256 hash
	 */
	computeFlowHash(flow: FlowDefinition): string;
}
//# sourceMappingURL=FlowRegistry.d.ts.map
