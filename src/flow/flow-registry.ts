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
} from './types.js';

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
        next: {
          conditions: [
            {
              when: "output.complexity === 'high'",
              goto: 'validate',
            },
          ],
          default: 'implement',
        },
      },
      {
        type: 'model',
        id: 'validate',
        name: 'Validate with User',
        model: 'haiku',
        prompt: `High complexity detected. Review needed:
\${{ steps.analyze.outputs.approach }}

Proceed? (yes/no)`,
        output: {
          approved: { type: 'boolean', transform: 'parseBoolean' },
        },
        next: {
          conditions: [
            {
              when: 'output.approved === false',
              goto: 'end',
            },
          ],
          default: 'implement',
        },
      },
      {
        type: 'model',
        id: 'implement',
        name: 'Implement Solution',
        model: 'sonnet',
        prompt: `Implement based on:
\${{ steps.analyze.outputs.approach }}
Files: \${{ steps.analyze.outputs.filesToModify }}`,
        context: {
          previousOutputs: ['analyze'],
        },
        next: {
          default: 'run-tests',
        },
      },
      {
        type: 'script',
        id: 'run-tests',
        name: 'Run Tests',
        script: 'npm test',
        output: {
          exitCode: { type: 'number' },
          passed: { type: 'boolean' },
        },
        next: {
          conditions: [
            {
              when: 'output.exitCode !== 0',
              goto: 'fix',
            },
          ],
          default: 'end',
        },
      },
      {
        type: 'model',
        id: 'fix',
        name: 'Fix Issues',
        model: 'sonnet',
        prompt: 'Fix test failures: ${{ steps.run-tests.outputs.stderr }}',
        next: {
          default: 'run-tests',
        },
      },
      {
        type: 'model',
        id: 'end',
        name: 'Complete',
        model: 'haiku',
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

  /**
   * Create a new flow registry
   * @param projectRoot - Root directory of the project
   */
  constructor(projectRoot: string) {
    this.configPath = path.join(projectRoot, '.agent-fleet', 'flows.yaml');
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
          this.validateFlow(flow);
          this.flows.set(id, flow);
          console.log(`Loaded flow: ${id}`);
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
   * Supports both 'model' and 'script' step types
   */
  private parseFlowStep(data: any): FlowStep {
    const stepType = data.type || 'model'; // Default to model for backward compatibility

    // Common properties
    const baseStep = {
      id: data.id,
      name: data.name || data.id,
      context: data.context,
      output: data.output,
      next: data.next,
      retry: data.retry,
      contract: data.contract,
    };

    if (stepType === 'script') {
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
   * Validate a flow definition
   * @throws FlowValidationError if validation fails
   */
  private validateFlow(flow: FlowDefinition): void {
    // Validate basic structure
    if (!flow.id) {
      throw new FlowValidationError(flow.id, 'Flow ID is required');
    }

    if (!flow.steps || flow.steps.length === 0) {
      throw new FlowValidationError(flow.id, 'Flow must have at least one step');
    }

    // Validate steps
    const stepIds = new Set<string>();
    for (const step of flow.steps) {
      // Check for duplicate step IDs
      if (stepIds.has(step.id)) {
        throw new FlowValidationError(
          flow.id,
          `Duplicate step ID: ${step.id}`
        );
      }
      stepIds.add(step.id);

      // Validate step has required fields
      if (!step.id) {
        throw new FlowValidationError(flow.id, 'Step ID is required');
      }

      // Type-specific validation
      switch (step.type) {
        case 'model':
          // Model step validation
          if (!step.prompt) {
            throw new FlowValidationError(
              flow.id,
              `Model step ${step.id} must have a prompt`
            );
          }

          if (!['sonnet', 'haiku', 'opus'].includes(step.model)) {
            throw new FlowValidationError(
              flow.id,
              `Step ${step.id} has invalid model: ${step.model}`
            );
          }
          break;

        case 'script':
          // Script step validation
          if (!step.script) {
            throw new FlowValidationError(
              flow.id,
              `Script step ${step.id} must have a script command`
            );
          }
          break;

        default:
          // This should never happen if types are correct
          const exhaustiveCheck: never = step;
          throw new FlowValidationError(
            flow.id,
            `Step has invalid type: ${(exhaustiveCheck as any).type}`
          );
      }
    }

    // Validate step references
    for (const step of flow.steps) {
      // Validate next.default references
      if (step.next?.default && !stepIds.has(step.next.default)) {
        throw new FlowValidationError(
          flow.id,
          `Step ${step.id} references non-existent step: ${step.next.default}`
        );
      }

      // Validate condition goto references
      if (step.next?.conditions) {
        for (const condition of step.next.conditions) {
          if (!stepIds.has(condition.goto)) {
            throw new FlowValidationError(
              flow.id,
              `Step ${step.id} condition references non-existent step: ${condition.goto}`
            );
          }
        }
      }

      // Validate previousOutputs references
      if (step.context?.previousOutputs) {
        for (const refStepId of step.context.previousOutputs) {
          if (!stepIds.has(refStepId)) {
            throw new FlowValidationError(
              flow.id,
              `Step ${step.id} references non-existent step in previousOutputs: ${refStepId}`
            );
          }
        }
      }
    }

    // Validate workspace config
    const validModes = ['isolated', 'shared'];
    if (!validModes.includes(flow.workspace.mode)) {
      throw new FlowValidationError(
        flow.id,
        `Invalid workspace mode: ${flow.workspace.mode}`
      );
    }

    const validGitStrategies = ['main-only', 'feature-branch', 'any'];
    if (!validGitStrategies.includes(flow.workspace.gitStrategy)) {
      throw new FlowValidationError(
        flow.id,
        `Invalid git strategy: ${flow.workspace.gitStrategy}`
      );
    }

    const validReusePolicies = ['never', 'if-available', 'always'];
    if (!validReusePolicies.includes(flow.workspace.reusePolicy)) {
      throw new FlowValidationError(
        flow.id,
        `Invalid reuse policy: ${flow.workspace.reusePolicy}`
      );
    }
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
    this.validateFlow(flow);
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
}
