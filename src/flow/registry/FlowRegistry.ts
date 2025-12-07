/**
 * Flow Registry
 *
 * Manages flow definitions, loading, validation, and lookup.
 * Provides default flows and supports project-specific flow configurations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
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

  /**
   * Create a new flow registry
   * @param projectRoot - Root directory of the project
   */
  constructor(projectRoot: string) {
    this.configPath = path.join(projectRoot, '.agent-fleet', 'flows.yaml');
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

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = yaml.load(content) as Record<string, any>;

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid YAML structure: expected object');
      }

      for (const [id, flowData] of Object.entries(parsed)) {
        try {
          const flow = this.parseFlowDefinition(id, flowData);

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

            throw new FlowValidationError(id, 'Flow validation failed. See errors above.');
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
          if (error instanceof FlowValidationError) {
            console.error(`Failed to load flow '${id}':`, error.message);
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to load flows from ${this.configPath}: ${error}`);
    }
  }

  /**
   * Parse raw YAML data into a FlowDefinition
   */
  private parseFlowDefinition(id: string, data: any): FlowDefinition {
    return {
      id,
      name: data.name || id,
      description: data.description || '',
      workspace: this.parseWorkspaceConfig(data.workspace),
      inputs: data.inputs || {},
      steps: (data.steps || []).map((step: any) => this.parseFlowStep(step)),
      hooks: data.hooks,
    };
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
          // Debounce: clear existing timeout and set a new one
          if (this.reloadTimeout) {
            clearTimeout(this.reloadTimeout);
          }

          this.reloadTimeout = setTimeout(() => {
            console.log('[FlowRegistry] Flows file changed, reloading...');
            this.reloadFlows();
          }, 100); // 100ms debounce
        }
      });

      console.log(`[FlowRegistry] Watching flows file: ${this.configPath}`);
    } catch (error) {
      console.error('[FlowRegistry] Failed to start watching flows file:', error);
    }
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
  }

  /**
   * Reload flows from the configuration file
   * Clears existing project flows and reloads them, keeping default flows
   */
  private async reloadFlows(): Promise<void> {
    try {
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
}
