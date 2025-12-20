/**
 * Flow Registry
 *
 * Manages flow definitions, loading, validation, and lookup.
 * Provides default flows and supports project-specific flow configurations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as crypto from 'crypto';
import type {
  FlowDefinition,
  FlowStep,
  WorkspaceConfig,
  VariableType,
} from '../types.js';
import { FlowValidator } from '../validation/FlowValidator.js';
import type { ValidationResult } from '../validation/FlowValidator.js';

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
   * @throws Error if file cannot be read or parsed
   */
  public async loadProjectFlows(): Promise<void> {
    if (!fs.existsSync(this.configPath)) {
      console.log(`No project flows found at ${this.configPath}, using defaults only`);
      return;
    }

    const validationErrors: Array<{ flowId: string; error: Error }> = [];

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, any>;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid YAML structure: expected object');
      }

      for (const [id, flowData] of Object.entries(parsed)) {
        try {
          const flow = await this.parseFlowDefinition(id, flowData);

          // Use new validator for comprehensive validation
          const validationResult = this.validator.validate(flow);

          if (!validationResult.valid) {
            // Log all validation errors
            console.error(`\nValidation failed for flow '${id}':`);
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

            const error = new FlowValidationError(id, 'Flow validation failed. See errors above.');
            validationErrors.push({ flowId: id, error });
            continue; // Continue to validate other flows
          }

          // Log warnings (non-blocking)
          const warnings = validationResult.issues.filter((i) => i.severity === 'warning');
          if (warnings.length > 0) {
            console.warn(`\nWarnings for flow '${id}':`);
            for (const warning of warnings) {
              console.warn(`  [WARN] ${warning.message}`);
              if (warning.suggestion) {
                console.warn(`    suggestion: ${warning.suggestion}`);
              }
            }
          }

          this.flows.set(id, flow);
          console.log(`✓ Loaded flow: ${id}`);
        } catch (error) {
          // Collect parsing errors too
          console.error(`\nFailed to parse flow '${id}':`, error instanceof Error ? error.message : String(error));
          validationErrors.push({ flowId: id, error: error instanceof Error ? error : new Error(String(error)) });
        }
      }

      // If there were any validation errors, fail startup
      if (validationErrors.length > 0) {
        console.error(`\n❌ Flow validation failed! ${validationErrors.length} flow(s) have errors:\n`);
        for (const { flowId, error } of validationErrors) {
          console.error(`  ✗ ${flowId}: ${error.message}`);
        }
        console.error('\n🛑 Orchestrator cannot start with invalid flows. Please fix the errors above.\n');
        throw new Error(`Flow validation failed for ${validationErrors.length} flow(s). See errors above.`);
      }
    } catch (error) {
      // Re-throw validation errors as-is
      if (error instanceof Error && error.message.includes('Flow validation failed')) {
        throw error;
      }
      throw new Error(`Failed to load flows from ${this.configPath}: ${error}`);
    }
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
      throw new Error(`Flow '${id}' is missing required 'version' field. Please add a semantic version (e.g., "1.0.0")`);
    }

    if (!this.isValidSemver(mergedData.version)) {
      throw new Error(`Flow '${id}' has invalid version '${mergedData.version}'. Version must be in semantic version format (e.g., "1.0.0")`);
    }

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
      throw new Error(`External flow file must be in the same directory as flows.yml for flow '${flowId}': ${sourcePath}`);
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
      } else if (
        key === 'statusTransitions' &&
        typeof value === 'object' &&
        typeof merged[key] === 'object'
      ) {
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
      mode: data.mode || 'isolated',
      gitStrategy: data.gitStrategy || 'main-only',
      reusePolicy: data.reusePolicy || 'never',
      concurrencyKey: data.concurrencyKey,
    };
  }

  /**
   * Parse a single flow step
   * Supports 'model', 'script', and 'subflow' step types
   */
  private parseFlowStep(data: any): FlowStep {
    const stepType = data.type || 'model'; // Default to model for backward compatibility

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

    if (stepType === 'subflow') {
      // SubFlow step
      return {
        ...baseStep,
        type: 'subflow',
        flowId: data.flowId || '',
        inputs: data.inputs || {},
        workspaceStrategy: data.workspaceStrategy || 'inherit',
        allowRecursion: data.allowRecursion,
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
    } else {
      // Model step (default)
      return {
        ...baseStep,
        type: 'model',
        model: data.model || 'haiku',
        prompt: data.prompt || '',
      };
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
   * Register a new flow programmatically
   * @param flow - Flow definition to register
   * @throws FlowValidationError if validation fails
   */
  public registerFlow(flow: FlowDefinition): void {
    const result = this.validateFlow(flow);
    if (!result.valid) {
      throw new FlowValidationError(
        flow.id,
        `Flow validation failed with ${result.summary.errors} error(s)`
      );
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
    return this.getAllFlows().filter((flow) => flow.workspace.mode === mode);
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
      const projectFlowIds = Array.from(this.flows.keys()).filter(
        id => !defaultFlowIds.includes(id)
      );

      projectFlowIds.forEach(id => this.flows.delete(id));

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
