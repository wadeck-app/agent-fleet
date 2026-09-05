/**
 * Flow Registry
 *
 * Manages flow definitions, loading, validation, and lookup.
 * Provides default flows and supports project-specific flow configurations.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import * as path from 'node:path';

import type {
	FlowDefinition,
	FlowStep,
	InputDefinition,
	InputSpec,
	NormalizedInputDefinition,
	VariableType,
	WorkspaceConfig,
} from '../types';
import { FlowValidator } from '../validation/FlowValidator';
import type { ValidationResult } from '../validation/FlowValidator';

/**
 * Validation error for flow definitions
 */
export class FlowValidationError extends Error {
	constructor(
		public flowId: string,
		message: string
	) {
		super(`Flow validation error for '${flowId}': ${message}`);
		this.name = 'FlowValidationError';
	}
}

/**
 * Default flow definitions built into the system
 */
const DEFAULT_FLOWS: Record<string, FlowDefinition> = {
	'simple-qa': {
		id: 'simple-qa',
		version: '1.0.0',
		name: 'Simple Question & Answer',
		description: 'Answer questions using existing codebase knowledge',
		workspace: {
			mode: 'shared',
			gitStrategy: 'main-only',
			reusePolicy: 'always',
			concurrencyKey: 'readonly',
		},
		inputs: {
			question: 'string',
		},
		steps: [
			{
				type: 'model',
				id: 'answer',
				name: 'Answer Question',
				model: 'haiku',
				prompt: '${{ inputs.question }}',
				context: {
					files: ['**/*.md', '**/*.ts'],
				},
			},
		],
	},

	'dev-full': {
		id: 'dev-full',
		version: '1.0.0',
		name: 'Full Development Cycle',
		description: 'Analysis → Validation → Implementation → Quality → Review',
		workspace: {
			mode: 'isolated',
			gitStrategy: 'feature-branch',
			reusePolicy: 'never',
		},
		inputs: {
			taskDescription: 'string',
		},
		steps: [
			{
				type: 'model',
				id: 'analyze',
				name: 'Analyze Requirements',
				model: 'sonnet',
				prompt: `Analyze this task and create an implementation plan:
Task: \${{ inputs.taskDescription }}
Priority: \${{ task.priority }}

Provide:
1. Technical approach
2. Files to modify
3. Risks and complexity`,
				context: {
					files: ['**/*.ts', 'README.md'],
				},
				output: {
					approach: { type: 'string' },
					filesToModify: { type: 'object', transform: 'parseJSON' },
					complexity: { type: 'string', required: true },
				},
			},
			{
				type: 'model',
				id: 'implement',
				name: 'Implement Solution',
				model: 'sonnet',
				depends: ['analyze'],
				prompt: `Implement based on:
\${{ steps.analyze.outputs.approach }}
Files: \${{ steps.analyze.outputs.filesToModify }}`,
				context: {
					previousOutputs: ['analyze'],
				},
			},
			{
				type: 'script',
				id: 'run-tests',
				name: 'Run Tests',
				depends: ['implement'],
				script: 'npm test',
				output: {
					exitCode: { type: 'number' },
					passed: { type: 'boolean' },
				},
			},
			{
				type: 'model',
				id: 'end',
				name: 'Complete',
				model: 'haiku',
				depends: ['run-tests'],
				prompt: 'Summarize work done',
			},
		],
	},
};

/**
 * Flow Registry manages all available flows
 */
export class FlowRegistry {
	private flows: Map<string, FlowDefinition> = new Map();
	private configPath: string;
	private validator: FlowValidator;
	private watcher: fs.FSWatcher | null = null;
	private reloadTimeout: NodeJS.Timeout | null = null;
	private externalFiles: Set<string> = new Set();
	private flowValidationResults: Map<string, ValidationResult> = new Map();

	/**
	 * Create a new flow registry
	 * @param projectRoot - Root directory of the project
	 */
	constructor(projectRoot: string) {
		this.configPath = path.join(projectRoot, '.agent-fleet', 'flows.yml');
		this.validator = new FlowValidator(this);
		this.loadDefaultFlows();
	}

	/**
	 * Load default flows into the registry
	 */
	private loadDefaultFlows(): void {
		for (const [id, flow] of Object.entries(DEFAULT_FLOWS)) {
			this.flows.set(id, flow);
		}
	}

	/**
	 * Load flows from project configuration file
	 * Loads all flows (valid and invalid) - invalid flows are marked but not rejected
	 * @throws Error if file cannot be read or parsed
	 */
	public async loadProjectFlows(): Promise<void> {
		if (!fs.existsSync(this.configPath)) {
			console.log(`No project flows found at ${this.configPath}, using defaults only`);
			return;
		}

		try {
			const content = fs.readFileSync(this.configPath, 'utf-8');
			const parsed = yaml.load(content) as Record<string, any>;

			if (!parsed || typeof parsed !== 'object') {
				throw new Error('Invalid YAML structure: expected object');
			}

			// Handle 'includes:' directive - load additional flow files
			const includes = parsed['includes'] as string[] | undefined;
			if (includes !== undefined) {
				if (!Array.isArray(includes)) {
					throw new Error(`'includes' in flows.yml must be an array of file paths`);
				}
				for (const includeFile of includes) {
					await this.loadIncludedFlowFile(includeFile);
				}
			}

			const RESERVED_KEYS = new Set(['includes']);
			for (const [id, flowData] of Object.entries(parsed)) {
				if (RESERVED_KEYS.has(id)) continue;
				try {
					const flow = await this.parseFlowDefinition(id, flowData);

					// Use new validator for comprehensive validation
					const validationResult = this.validator.validate(flow);

					// Log validation status
					if (!validationResult.valid) {
						console.error(`\n  Flow '${id}' has validation errors (loading anyway for editing):`);
						console.error(`  Errors: ${validationResult.summary.errors}`);
						console.error(`  Warnings: ${validationResult.summary.warnings}\n`);

						for (const issue of validationResult.issues) {
							if (issue.severity === 'error') {
								console.error(`  [ERROR] ${issue.message}`);
								if (issue.location?.stepId) {
									console.error(`    at step: ${issue.location.stepId}`);
								}
								if (issue.suggestion) {
									console.error(`    suggestion: ${issue.suggestion}`);
								}
							}
						}
					} else {
						// Log warnings for valid flows
						const warnings = validationResult.issues.filter(i => i.severity === 'warning');
						if (warnings.length > 0) {
							console.warn(`\nWarnings for flow '${id}':`);
							for (const warning of warnings) {
								console.warn(`  [WARN] ${warning.message}`);
								if (warning.suggestion) {
									console.warn(`    suggestion: ${warning.suggestion}`);
								}
							}
						}
						console.log(` Loaded flow: ${id}`);
					}

					// ALWAYS store the flow (valid or invalid)
					this.flows.set(id, flow);

					// Store validation result for metadata building
					this.flowValidationResults.set(id, validationResult);
				} catch (error) {
					// Parsing errors still prevent loading (can't create FlowDefinition)
					console.error(
						`\n Failed to parse flow '${id}':`,
						error instanceof Error ? String(error) : String(error)
					);
					console.error(`    This flow will NOT be loaded.\n`);
				}
			}

			// Summary logging instead of throwing
			const totalFlows = this.flows.size;
			const invalidFlows = Array.from(this.flowValidationResults.entries()).filter(
				([_, result]) => !result.valid
			);

			if (invalidFlows.length > 0) {
				console.warn(
					`\n  Loaded ${totalFlows} flows (${invalidFlows.length} invalid, ${totalFlows - invalidFlows.length} valid)`
				);
				console.warn(`   Invalid flows can be edited in the UI but cannot be executed.\n`);
			} else {
				console.log(`\n All ${totalFlows} flows loaded successfully\n`);
			}
		} catch (error) {
			throw new Error(`Failed to load flows from ${this.configPath}: ${error}`);
		}
	}

	/**
	 * Validate input format from YAML
	 * Ensures inputs are either valid VariableType strings or InputDefinition objects
	 * @param rawInputs - Raw inputs from YAML (can be undefined)
	 * @param flowId - Flow ID for error messages
	 * @throws Error if input format is invalid
	 */
	private validateInputFormat(rawInputs: Record<string, any> | undefined, flowId: string): void {
		if (!rawInputs || typeof rawInputs !== 'object') {
			return;
		}

		const validTypes: VariableType[] = [
			'string',
			'number',
			'boolean',
			'object',
			'text',
			'url',
			'markdown',
			'integer',
			'percentage',
			'duration',
			'enum',
			'multi-enum',
			'file',
			'folder',
			'date',
			'datetime',
			'regex',
			'array',
			'keyvalue',
			'password',
			'priority',
		];

		for (const [inputName, inputSpec] of Object.entries(rawInputs)) {
			// Shorthand: "string", "number", etc.
			if (typeof inputSpec === 'string') {
				if (!validTypes.includes(inputSpec as VariableType)) {
					throw new Error(
						`Flow '${flowId}': Invalid input type '${inputSpec}' for input '${inputName}'. ` +
							`Valid types: ${validTypes.join(', ')}`
					);
				}
			}
			// Extended: { type, required, default, description }
			else if (typeof inputSpec === 'object' && inputSpec !== null) {
				const def = inputSpec as InputDefinition;

				// Validate required 'type' field
				if (!def.type) {
					throw new Error(`Flow '${flowId}': Input '${inputName}' is missing required 'type' field`);
				}

				if (!validTypes.includes(def.type)) {
					throw new Error(
						`Flow '${flowId}': Invalid input type '${def.type}' for input '${inputName}'. ` +
							`Valid types: ${validTypes.join(', ')}`
					);
				}

				// Validate that default value type matches declared type (basic check)
				if (def.default !== undefined) {
					const defaultType = typeof def.default;
					const expectedType = def.type === 'object' ? 'object' : def.type;

					if (defaultType !== expectedType && !(def.type === 'number' && defaultType === 'number')) {
						console.warn(
							`Flow '${flowId}': Default value type '${defaultType}' for input '${inputName}' ` +
								`does not match declared type '${def.type}'`
						);
					}
				}
			} else {
				throw new Error(
					`Flow '${flowId}': Invalid input specification for '${inputName}'. ` +
						`Expected string (shorthand) or object (extended format)`
				);
			}
		}
	}

	/**
	 * Normalize input specifications from YAML into internal representation
	 * Handles both shorthand (type string) and extended (object) formats
	 * This is called by SchemaValidator during validation phase
	 * @param rawInputs - Raw inputs from YAML (can be undefined)
	 * @returns Record of normalized input definitions
	 */
	public normalizeInputs(rawInputs: Record<string, any> | undefined): Record<string, NormalizedInputDefinition> {
		if (!rawInputs || typeof rawInputs !== 'object') {
			return {};
		}

		const normalized: Record<string, NormalizedInputDefinition> = {};

		for (const [inputName, inputSpec] of Object.entries(rawInputs)) {
			// Shorthand: "string", "number", etc.
			if (typeof inputSpec === 'string') {
				normalized[inputName] = {
					type: inputSpec as VariableType,
					required: false,
					source: 'explicit',
				};
			}
			// Extended: { type, required, default, description, options }
			else if (typeof inputSpec === 'object' && inputSpec !== null) {
				const def = inputSpec as InputDefinition;
				normalized[inputName] = {
					type: def.type,
					required: def.required ?? false,
					default: def.default,
					description: def.description,
					options: def.options,
					source: 'explicit',
				};
			}
		}

		return normalized;
	}

	/**
	 * Parse raw YAML data into a FlowDefinition
	 */
	private async parseFlowDefinition(id: string, data: any): Promise<FlowDefinition> {
		let baseDefinition: any = {};

		// Check for 'source' field to load from external file
		if (data.source && typeof data.source === 'string') {
			// Load and parse external file
			const externalData = await this.loadExternalFlowFile(data.source, id);

			// Extract flow by ID from external file
			if (externalData[id]) {
				baseDefinition = externalData[id];
			} else {
				throw new Error(`External file '${data.source}' does not contain flow definition for '${id}'`);
			}
		}

		// Merge local overrides with external definition
		const mergedData = this.mergeFlowDefinitions(baseDefinition, data);

		// Validate version field
		if (!mergedData.version) {
			throw new Error(
				`Flow '${id}' is missing required 'version' field. Please add a semantic version (e.g., "1.0.0")`
			);
		}

		if (!this.isValidSemver(mergedData.version)) {
			throw new Error(
				`Flow '${id}' has invalid version '${mergedData.version}'. Version must be in semantic version format (e.g., "1.0.0")`
			);
		}

		// Validate input format
		this.validateInputFormat(mergedData.inputs, id);

		return {
			id,
			version: mergedData.version,
			name: mergedData.name || id,
			description: mergedData.description || '',
			workspace: this.parseWorkspaceConfig(mergedData.workspace),
			inputs: mergedData.inputs || {},
			steps: (mergedData.steps || []).map((step: any) => this.parseFlowStep(step)),
			hooks: mergedData.hooks,
			statusTransitions: mergedData.statusTransitions,
			execution: mergedData.execution,
			trigger: mergedData.trigger,
		};
	}

	/**
	 * Load and parse an external flow file
	 * @param sourcePath - Relative path to external file (must be sibling of flows.yml)
	 * @param flowId - Flow ID being loaded (for error messages)
	 * @returns Parsed YAML content
	 * @throws Error if file doesn't exist, is outside allowed directory, or parse fails
	 */
	private async loadExternalFlowFile(sourcePath: string, flowId: string): Promise<Record<string, any>> {
		// Validate path security
		this.validateExternalFilePath(sourcePath, flowId);

		// Resolve path relative to flows.yml directory
		const flowsDir = path.dirname(this.configPath);
		const absolutePath = path.resolve(flowsDir, sourcePath);

		// Check file exists
		if (!fs.existsSync(absolutePath)) {
			throw new Error(`External flow file not found for flow '${flowId}': ${sourcePath}`);
		}

		try {
			const content = fs.readFileSync(absolutePath, 'utf-8');
			const parsed = yaml.load(content) as Record<string, any>;

			if (!parsed || typeof parsed !== 'object') {
				throw new Error(`Invalid YAML structure in ${sourcePath}: expected object`);
			}

			// Track for hot-reload
			this.trackExternalFile(absolutePath);

			return parsed;
		} catch (error) {
			throw new Error(`Failed to load external flow file '${sourcePath}' for flow '${flowId}': ${error}`);
		}
	}

	/**
	 * Load all flows from an included flow file (via 'includes:' directive)
	 * Applies same security constraints as external flow files
	 * @param filePath - Relative path to the included file (must be sibling .yml)
	 */
	private async loadIncludedFlowFile(filePath: string): Promise<void> {
		// Reuse path security validation
		this.validateExternalFilePath(filePath, `includes:${filePath}`);

		const flowsDir = path.dirname(this.configPath);
		const absolutePath = path.resolve(flowsDir, filePath);

		if (!fs.existsSync(absolutePath)) {
			console.log(`Included flow file not found (skipping): ${filePath}`);
			return;
		}

		try {
			const content = fs.readFileSync(absolutePath, 'utf-8');
			const parsedInclude = yaml.load(content) as Record<string, any>;

			// null = empty file or comments-only -- valid, just no flows to load
			if (parsedInclude === null || parsedInclude === undefined) {
				this.trackExternalFile(absolutePath);
				return;
			}

			if (typeof parsedInclude !== 'object') {
				throw new Error(`Invalid YAML structure in ${filePath}: expected object`);
			}

			// Track for hot-reload
			this.trackExternalFile(absolutePath);

			console.log(`Loading flows from included file: ${filePath}`);
			for (const [id, flowData] of Object.entries(parsedInclude)) {
				try {
					const flow = await this.parseFlowDefinition(id, flowData);
					const validationResult = this.validator.validate(flow);

					if (!validationResult.valid) {
						console.error(
							`\n  Flow '${id}' (from ${filePath}) has validation errors (loading anyway for editing):`
						);
						for (const issue of validationResult.issues) {
							if (issue.severity === 'error') {
								console.error(`  [ERROR] ${issue.message}`);
							}
						}
					} else {
						console.log(` Loaded flow: ${id} (from ${filePath})`);
					}

					this.flows.set(id, flow);
					this.flowValidationResults.set(id, validationResult);
				} catch (error) {
					console.error(
						`\n Failed to parse flow '${id}' from ${filePath}:`,
						error instanceof Error ? String(error) : String(error)
					);
				}
			}
		} catch (error) {
			throw new Error(`Failed to load included flow file '${filePath}': ${error}`);
		}
	}

	/**
	 * Validate external file path for security
	 * Must be a sibling file (no directory traversal)
	 * @throws Error if path is invalid or unsafe
	 */
	private validateExternalFilePath(sourcePath: string, flowId: string): void {
		// Reject absolute paths
		if (path.isAbsolute(sourcePath)) {
			throw new Error(`External flow file path must be relative for flow '${flowId}': ${sourcePath}`);
		}

		// Reject path traversal
		const normalized = path.normalize(sourcePath);
		if (normalized.includes('..') || normalized.startsWith('/') || normalized.startsWith('\\')) {
			throw new Error(`External flow file path contains invalid characters for flow '${flowId}': ${sourcePath}`);
		}

		// Must be sibling (no subdirectories)
		if (normalized.includes(path.sep)) {
			throw new Error(
				`External flow file must be in the same directory as flows.yml for flow '${flowId}': ${sourcePath}`
			);
		}

		// Must have .yml extension
		if (!sourcePath.endsWith('.yml')) {
			throw new Error(`External flow file must have .yml extension for flow '${flowId}': ${sourcePath}`);
		}
	}

	/**
	 * Merge flow definitions: local fields override external fields
	 * Deep merge for nested objects like workspace, inputs, hooks
	 * @param external - Base definition from external file
	 * @param local - Override definition from flows.yml
	 * @returns Merged definition
	 */
	private mergeFlowDefinitions(external: any, local: any): any {
		// Remove 'source' field from local (not part of flow definition)
		const { source, ...localWithoutSource } = local;

		// Start with external as base
		const merged = { ...external };

		// Override with local fields
		for (const [key, value] of Object.entries(localWithoutSource)) {
			if (value === undefined) {
				continue; // Skip undefined values
			}

			// Deep merge for objects (workspace, inputs, hooks)
			if (key === 'workspace' && typeof value === 'object' && typeof merged[key] === 'object') {
				merged[key] = { ...merged[key], ...value };
			} else if (key === 'inputs' && typeof value === 'object' && typeof merged[key] === 'object') {
				merged[key] = { ...merged[key], ...value };
			} else if (key === 'hooks' && typeof value === 'object' && typeof merged[key] === 'object') {
				merged[key] = { ...merged[key], ...value };
			} else if (key === 'statusTransitions' && typeof value === 'object' && typeof merged[key] === 'object') {
				merged[key] = { ...merged[key], ...value };
			} else {
				// Simple override (including steps array)
				merged[key] = value;
			}
		}

		return merged;
	}

	/**
	 * Track an external file for hot-reload
	 * @param absolutePath - Absolute path to external file
	 */
	private trackExternalFile(absolutePath: string): void {
		this.externalFiles.add(absolutePath);
	}

	/**
	 * Parse workspace configuration
	 */
	private parseWorkspaceConfig(data: any): WorkspaceConfig {
		return {
			mode: data?.mode || 'isolated',
			gitStrategy: data?.gitStrategy || 'main-only',
			reusePolicy: data?.reusePolicy || 'never',
			concurrencyKey: data?.concurrencyKey,
		};
	}

	/**
	 * Parse a single flow step
	 * Supports 'model', 'script', 'subflow', and 'user_intervention' step types
	 */
	private parseFlowStep(data: any): FlowStep {
		const stepType = data.type;

		// Validate that type is specified
		if (!stepType) {
			throw new Error(
				`Step '${data.id || '<unknown>'}' is missing required 'type' field. ` +
					`Valid types: 'model', 'script', 'subflow', 'user_intervention'`
			);
		}

		// Common properties
		const baseStep = {
			id: data.id,
			name: data.name || data.id,
			context: data.context,
			output: data.output,
			depends: data.depends,
			when: data.when,
			skipOnLoop: data.skipOnLoop,
			retry: data.retry,
			onFailure: data.onFailure,
			contract: data.contract,
		};

		if (stepType === 'model') {
			// Model step
			return {
				...baseStep,
				type: 'model',
				model: data.model || 'haiku',
				prompt: data.prompt || '',
			};
		} else if (stepType === 'script') {
			// Script step
			return {
				...baseStep,
				type: 'script',
				script: data.script || '',
				workingDir: data.workingDir,
				env: data.env,
				captureOutput: data.captureOutput !== false, // Default to true
			};
		} else if (stepType === 'subflow') {
			// SubFlow step
			return {
				...baseStep,
				type: 'subflow',
				flowId: data.flowId || '',
				inputs: data.inputs || {},
				workspaceStrategy: data.workspaceStrategy || 'inherit',
				allowRecursion: data.allowRecursion,
			};
		} else if (stepType === 'user_intervention') {
			// User Intervention step
			return {
				...baseStep,
				type: 'user_intervention',
				interventionType: data.interventionType,
				blocking: data.blocking !== false, // Default to true
				timeout: data.timeout,
				approval: data.approval,
				question: data.question,
				choice: data.choice,
			};
		} else {
			// Unknown step type - FAIL FAST
			throw new Error(
				`Unknown step type '${stepType}' for step '${data.id || '<unknown>'}'. ` +
					`Valid types: 'model', 'script', 'subflow', 'user_intervention'`
			);
		}
	}

	/**
	 * Validate a flow definition using the new validator
	 * @returns Validation result with detailed errors
	 */
	public validateFlow(flow: FlowDefinition): ValidationResult {
		return this.validator.validate(flow);
	}

	/**
	 * Get a flow by ID
	 * @param id - Flow identifier
	 * @returns Flow definition or undefined if not found
	 */
	public getFlow(id: string): FlowDefinition | undefined {
		return this.flows.get(id);
	}

	/**
	 * Get all registered flows
	 * @returns Array of all flow definitions
	 */
	public getAllFlows(): FlowDefinition[] {
		return Array.from(this.flows.values());
	}

	/**
	 * Check if a flow exists
	 * @param id - Flow identifier
	 * @returns True if flow exists
	 */
	public hasFlow(id: string): boolean {
		return this.flows.has(id);
	}

	/**
	 * Get list of available flow IDs
	 * @returns Array of flow IDs
	 */
	public getFlowIds(): string[] {
		return Array.from(this.flows.keys());
	}

	/**
	 * Get validation result for a flow
	 * @param id - Flow identifier
	 * @returns Validation result or undefined if flow not validated
	 */
	public getFlowValidationResult(id: string): ValidationResult | undefined {
		return this.flowValidationResults.get(id);
	}

	/**
	 * Register a new flow programmatically
	 * @param flow - Flow definition to register
	 * @throws FlowValidationError if validation fails
	 */
	public registerFlow(flow: FlowDefinition): void {
		const result = this.validateFlow(flow);
		if (!result.valid) {
			throw new FlowValidationError(flow.id, `Flow validation failed with ${result.summary.errors} error(s)`);
		}
		this.flows.set(flow.id, flow);
	}

	/**
	 * Remove a flow from the registry
	 * @param id - Flow identifier
	 * @returns True if flow was removed
	 */
	public unregisterFlow(id: string): boolean {
		return this.flows.delete(id);
	}

	/**
	 * Get flows by workspace mode
	 * @param mode - Workspace mode to filter by
	 * @returns Array of matching flows
	 */
	public getFlowsByWorkspaceMode(mode: 'isolated' | 'shared'): FlowDefinition[] {
		return this.getAllFlows().filter(flow => flow.workspace.mode === mode);
	}

	/**
	 * Clear all flows (except defaults if specified)
	 * @param keepDefaults - If true, keep default flows
	 */
	public clear(keepDefaults = true): void {
		this.flows.clear();
		if (keepDefaults) {
			this.loadDefaultFlows();
		}
	}

	/**
	 * Start watching the flows configuration file for changes
	 * Automatically reloads flows when the file is modified
	 */
	public startWatching(): void {
		if (this.watcher) {
			console.log('[FlowRegistry] Already watching flows file');
			return;
		}

		if (!fs.existsSync(this.configPath)) {
			console.log(`[FlowRegistry] No flows file found at ${this.configPath}, skipping watch setup`);
			return;
		}

		try {
			this.watcher = fs.watch(this.configPath, (eventType, filename) => {
				if (eventType === 'change') {
					this.scheduleReload();
				}
			});

			console.log(`[FlowRegistry] Watching flows file: ${this.configPath}`);

			// Watch external files (if any were loaded)
			this.watchExternalFiles();
		} catch (error) {
			console.error('[FlowRegistry] Failed to start watching flows file:', error);
		}
	}

	/**
	 * Watch all tracked external flow files
	 */
	private watchExternalFiles(): void {
		for (const externalPath of this.externalFiles) {
			if (!fs.existsSync(externalPath)) {
				console.warn(`[FlowRegistry] External file no longer exists: ${externalPath}`);
				continue;
			}

			try {
				fs.watch(externalPath, (eventType, filename) => {
					if (eventType === 'change') {
						console.log(`[FlowRegistry] External flow file changed: ${externalPath}`);
						this.scheduleReload();
					}
				});

				console.log(`[FlowRegistry] Watching external file: ${externalPath}`);
			} catch (error) {
				console.error(`[FlowRegistry] Failed to watch external file ${externalPath}:`, error);
			}
		}
	}

	/**
	 * Schedule a debounced reload
	 */
	private scheduleReload(): void {
		// Debounce: clear existing timeout and set a new one
		if (this.reloadTimeout) {
			clearTimeout(this.reloadTimeout);
		}

		this.reloadTimeout = setTimeout(() => {
			console.log('[FlowRegistry] Flows file changed, reloading...');
			this.reloadFlows();
		}, 100); // 100ms debounce
	}

	/**
	 * Stop watching the flows configuration file
	 */
	public stopWatching(): void {
		if (this.reloadTimeout) {
			clearTimeout(this.reloadTimeout);
			this.reloadTimeout = null;
		}

		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
			console.log('[FlowRegistry] Stopped watching flows file');
		}

		// Clear external files tracking
		this.externalFiles.clear();
	}

	/**
	 * Reload flows from the configuration file
	 * Clears existing project flows and reloads them, keeping default flows
	 */
	private async reloadFlows(): Promise<void> {
		try {
			// Clear external files (will be re-tracked during reload)
			this.externalFiles.clear();

			// Clear only project flows (keep defaults)
			const defaultFlowIds = Object.keys(DEFAULT_FLOWS);
			const projectFlowIds = Array.from(this.flows.keys()).filter(id => !defaultFlowIds.includes(id));

			projectFlowIds.forEach(id => {
				this.flows.delete(id);
				this.flowValidationResults.delete(id); // Clear validation results too
			});

			// Reload project flows
			await this.loadProjectFlows();
			console.log('[FlowRegistry] Flows reloaded successfully');
		} catch (error) {
			console.error('[FlowRegistry] Failed to reload flows:', error);
		}
	}

	/**
	 * Validate semantic version format
	 * Accepts formats like: "1.0.0", "2.1.3", "0.0.1"
	 * @param version - Version string to validate
	 * @returns True if valid semver format
	 */
	private isValidSemver(version: string): boolean {
		// Simple semver pattern: MAJOR.MINOR.PATCH
		const semverPattern = /^\d+\.\d+\.\d+$/;
		return semverPattern.test(version);
	}

	/**
	 * Save a custom flow to .agent-fleet/flows-custom.yml and register it in memory.
	 * Creates the file if it doesn't exist.
	 * Uses simple atomic write (write to temp file, rename) to avoid partial writes.
	 * @param flow - Flow definition to save
	 */
	public async saveCustomFlow(flow: FlowDefinition): Promise<void> {
		const customFlowsPath = path.join(path.dirname(this.configPath), 'flows-custom.yml');
		const tmpPath = `${customFlowsPath}.tmp`;

		// Load existing custom flows from file (if exists)
		let existingFlows: Record<string, any> = {};
		if (fs.existsSync(customFlowsPath)) {
			try {
				const content = fs.readFileSync(customFlowsPath, 'utf-8');
				const parsed = yaml.load(content) as Record<string, any> | null;
				if (parsed && typeof parsed === 'object') {
					existingFlows = parsed;
				}
			} catch (error) {
				console.error(`[FlowRegistry] Failed to read existing custom flows: ${error}`);
			}
		}

		// Add or replace the flow by its ID
		existingFlows[flow.id] = {
			version: flow.version,
			name: flow.name,
			description: flow.description,
			workspace: flow.workspace,
			inputs: flow.inputs,
			steps: flow.steps,
			...(flow.hooks !== undefined && { hooks: flow.hooks }),
			...(flow.statusTransitions !== undefined && { statusTransitions: flow.statusTransitions }),
			...(flow.execution !== undefined && { execution: flow.execution }),
			...(flow.trigger !== undefined && { trigger: flow.trigger }),
		};

		// Serialize to YAML
		const content = yaml.dump(existingFlows, { lineWidth: 120 });

		// Atomic write: write to temp file, then rename
		fs.writeFileSync(tmpPath, content, 'utf-8');
		fs.renameSync(tmpPath, customFlowsPath);

		// Register in memory immediately
		this.registerFlow(flow);

		console.log(`[FlowRegistry] Saved custom flow '${flow.id}' to ${customFlowsPath}`);
	}

	/**
	 * Compute a deterministic hash of flow content
	 * Hash includes: steps, workspace config, and inputs
	 * Hash excludes: id, name, description, hooks, statusTransitions
	 * @param flow - Flow definition to hash
	 * @returns 8-character hex digest of SHA256 hash
	 */
	public computeFlowHash(flow: FlowDefinition): string {
		// Create a normalized object with only the fields that affect flow execution
		const hashableContent = {
			steps: flow.steps,
			workspace: flow.workspace,
			inputs: flow.inputs,
		};

		// Serialize to JSON with sorted keys for determinism (deep sort)
		const jsonString = JSON.stringify(hashableContent, (key, value) => {
			if (value && typeof value === 'object' && !Array.isArray(value)) {
				return Object.keys(value)
					.sort()
					.reduce((sorted: any, k) => {
						sorted[k] = value[k];
						return sorted;
					}, {});
			}
			return value;
		});

		// Compute SHA256 hash
		const hash = crypto.createHash('sha256');
		hash.update(jsonString);

		// Return first 8 characters of hex digest
		return hash.digest('hex').substring(0, 8);
	}
}
