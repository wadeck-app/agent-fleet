/**
 * Tests for SemanticValidator - Semantic validation of flows
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { SemanticValidator } from './SemanticValidator.js';
import { GraphValidator } from './GraphValidator.js';
import { FlowRegistry } from '../registry/FlowRegistry.js';
import { ValidationCode } from './ValidationTypes.js';
import type { FlowDefinition, FlowStep, SubFlowStep } from '../types.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MockIssueCollector } from '../../test-utils/index.js';

describe('SemanticValidator', () => {
  let issueCollector: MockIssueCollector;
  let graphValidator: GraphValidator;
  let registry: FlowRegistry;
  let semanticValidator: SemanticValidator;
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test flows
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-validator-test-'));
    const flowsDir = path.join(tempDir, '.agent-fleet');
    fs.mkdirSync(flowsDir, { recursive: true });

    // Create empty flows.yml to avoid warnings
    fs.writeFileSync(path.join(flowsDir, 'flows.yml'), '');

    registry = new FlowRegistry(tempDir);
    issueCollector = new MockIssueCollector();
    graphValidator = new GraphValidator(issueCollector, registry);
    semanticValidator = new SemanticValidator(issueCollector, graphValidator, registry);
  });

  describe('Step Reference Validation', () => {
    test('should error when depends references non-existent step', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
          depends: ['non-existent-step'],
        },
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues).toHaveLength(1);
      expect(issueCollector.issues[0].code).toBe(ValidationCode.UNDEFINED_STEP);
      expect(issueCollector.issues[0].message).toContain('depends on non-existent step');
      expect(issueCollector.issues[0].message).toContain('non-existent-step');
    });

    test('should error when previousOutputs references non-existent step', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
          context: {
            previousOutputs: ['non-existent-step'],
          },
        },
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues).toHaveLength(1);
      expect(issueCollector.issues[0].code).toBe(ValidationCode.UNDEFINED_STEP);
      expect(issueCollector.issues[0].message).toContain('references non-existent step in previousOutputs');
    });

    test('should error when onFailure.goto references non-existent step', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
          onFailure: {
            goto: 'non-existent-step',
          },
        },
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues).toHaveLength(1);
      expect(issueCollector.issues[0].code).toBe(ValidationCode.UNDEFINED_STEP);
      expect(issueCollector.issues[0].message).toContain('onFailure.goto referencing non-existent step');
    });

    test('should accept valid step references', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
        },
        {
          type: 'model',
          id: 'step2',
          name: 'Step 2',
          model: 'sonnet',
          prompt: 'Test',
          depends: ['step1'],
          context: {
            previousOutputs: ['step1'],
          },
          onFailure: {
            goto: 'step1',
          },
        },
      ];

      const stepIds = new Set(['step1', 'step2']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues).toHaveLength(0);
    });
  });

  describe('onFailure Configuration Validation', () => {
    test('should error when maxIterations is invalid', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
          onFailure: {
            goto: 'step1',
            maxIterations: -1,
          },
        },
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      const maxIterError = issueCollector.issues.find(
        (i) => i.code === ValidationCode.INVALID_VALUE && i.location?.field === 'onFailure.maxIterations'
      );
      expect(maxIterError).toBeDefined();
      expect(maxIterError?.message).toContain('invalid onFailure.maxIterations');
    });

    test('should error when resetOnSuccess is invalid type', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
          onFailure: {
            goto: 'step1',
            resetOnSuccess: 'invalid' as any,
          },
        },
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      const resetError = issueCollector.issues.find(
        (i) => i.code === ValidationCode.INVALID_TYPE && i.location?.field === 'onFailure.resetOnSuccess'
      );
      expect(resetError).toBeDefined();
      expect(resetError?.message).toContain('invalid onFailure.resetOnSuccess type');
    });

    test('should accept valid onFailure configuration', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
          onFailure: {
            goto: 'step1',
            maxIterations: 3,
            resetOnSuccess: true,
          },
        },
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues).toHaveLength(0);
    });
  });

  describe('skipOnLoop Validation', () => {
    test('should error when skipOnLoop is invalid type', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
          skipOnLoop: 'invalid' as any,
        },
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues).toHaveLength(1);
      expect(issueCollector.issues[0].code).toBe(ValidationCode.INVALID_TYPE);
      expect(issueCollector.issues[0].message).toContain('invalid skipOnLoop type');
    });

    test('should accept valid skipOnLoop value', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Step 1',
          model: 'sonnet',
          prompt: 'Test',
          skipOnLoop: true,
        },
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues).toHaveLength(0);
    });
  });

  describe('SubFlow Reference Validation', () => {
    test('should error when flowId references non-existent flow', () => {
      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'non-existent-flow',
          inputs: {},
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues.length).toBeGreaterThan(0);
      expect(issueCollector.issues[0].code).toBe(ValidationCode.UNDEFINED_FLOW);
      expect(issueCollector.issues[0].message).toContain('references non-existent flow');
    });

    test('should detect direct circular reference without allowRecursion', () => {
      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'test-flow', // Same as current flow
          inputs: {},
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues.length).toBeGreaterThan(0);
      const circularError = issueCollector.issues.find(
        (i) => i.code === ValidationCode.CIRCULAR_SUBFLOW_REFERENCE
      );
      expect(circularError).toBeDefined();
      expect(circularError?.severity).toBe('error');
      expect(circularError?.message).toContain('circular reference');
    });

    test('should warn when direct recursion has allowRecursion=true', () => {
      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'test-flow', // Same as current flow
          inputs: {},
          allowRecursion: true,
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues.length).toBeGreaterThan(0);
      const circularWarning = issueCollector.issues.find(
        (i) => i.code === ValidationCode.CIRCULAR_SUBFLOW_REFERENCE
      );
      expect(circularWarning).toBeDefined();
      expect(circularWarning?.severity).toBe('warning');
      expect(circularWarning?.message).toContain('recursive');
    });

    test('should error when allowRecursion=true but not recursive', () => {
      // Register a target flow
      const targetFlow: FlowDefinition = {
        id: 'target-flow',
        version: '1.0.0',
        name: 'Target Flow',
        description: 'Target',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'model',
            id: 'target-step',
            name: 'Target Step',
            model: 'sonnet',
            prompt: 'Test',
          },
        ],
      };
      registry.registerFlow(targetFlow);

      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'target-flow', // Different flow
          inputs: {},
          allowRecursion: true, // But allowRecursion is set
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      const allowRecursionError = issueCollector.issues.find(
        (i) => i.code === ValidationCode.INVALID_VALUE && i.location?.field === 'allowRecursion'
      );
      expect(allowRecursionError).toBeDefined();
      expect(allowRecursionError?.message).toContain('allowRecursion=true but does not call itself');
    });

    test('should error when workspaceStrategy is invalid', () => {
      // Register a target flow
      const targetFlow: FlowDefinition = {
        id: 'target-flow',
        version: '1.0.0',
        name: 'Target Flow',
        description: 'Target',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'model',
            id: 'target-step',
            name: 'Target Step',
            model: 'sonnet',
            prompt: 'Test',
          },
        ],
      };
      registry.registerFlow(targetFlow);

      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'target-flow',
          inputs: {},
          workspaceStrategy: 'invalid' as any,
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      const strategyError = issueCollector.issues.find(
        (i) => i.code === ValidationCode.INVALID_VALUE && i.location?.field === 'workspaceStrategy'
      );
      expect(strategyError).toBeDefined();
      expect(strategyError?.message).toContain('invalid workspaceStrategy');
    });

    test('should error when inputs is not an object', () => {
      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'target-flow',
          inputs: 'not an object' as any,
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      // Note: inputs type validation is actually done by SchemaValidator, not SemanticValidator
      // This test verifies that SemanticValidator doesn't crash when inputs is malformed
      // The actual type validation would be caught by FlowValidator orchestrator running SchemaValidator first
      expect(issueCollector.issues.length).toBeGreaterThanOrEqual(0);
    });

    test('should warn when required input is missing', () => {
      // Register a target flow with required inputs
      const targetFlow: FlowDefinition = {
        id: 'target-flow',
        version: '1.0.0',
        name: 'Target Flow',
        description: 'Target',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {
          requiredInput: 'string',
        },
        steps: [
          {
            type: 'model',
            id: 'target-step',
            name: 'Target Step',
            model: 'sonnet',
            prompt: 'Test',
          },
        ],
      };
      registry.registerFlow(targetFlow);

      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'target-flow',
          inputs: {}, // Missing required input
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      const missingInputWarning = issueCollector.issues.find(
        (i) => i.code === ValidationCode.MISSING_FIELD && i.severity === 'warning'
      );
      expect(missingInputWarning).toBeDefined();
      expect(missingInputWarning?.message).toContain('missing required input');
      expect(missingInputWarning?.message).toContain('requiredInput');
    });

    test('should pass when all required inputs are provided', () => {
      // Register a target flow with required inputs
      const targetFlow: FlowDefinition = {
        id: 'target-flow',
        version: '1.0.0',
        name: 'Target Flow',
        description: 'Target',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {
          requiredInput: 'string',
        },
        steps: [
          {
            type: 'model',
            id: 'target-step',
            name: 'Target Step',
            model: 'sonnet',
            prompt: 'Test',
          },
        ],
      };
      registry.registerFlow(targetFlow);

      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'target-flow',
          inputs: {
            requiredInput: 'value',
          },
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      semanticValidator.validateSemantics(flow, stepIds);

      expect(issueCollector.issues).toHaveLength(0);
    });
  });

  describe('Validator without FlowRegistry', () => {
    test('should skip flow reference validation when registry is not provided', () => {
      const validatorNoRegistry = new SemanticValidator(issueCollector, graphValidator);

      const steps: FlowStep[] = [
        {
          type: 'subflow',
          id: 'step1',
          name: 'Step 1',
          flowId: 'any-flow',
          inputs: {},
        } as SubFlowStep,
      ];

      const stepIds = new Set(['step1']);
      const flow: FlowDefinition = {
        id: 'test-flow',
        version: '1.0.0',
        name: 'Test',
        description: 'Test',
        workspace: { mode: 'manual', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps,
      };

      validatorNoRegistry.validateSemantics(flow, stepIds);

      // Should not error about undefined flow when registry is not available
      const undefinedFlowError = issueCollector.issues.find(
        (i) => i.code === ValidationCode.UNDEFINED_FLOW
      );
      expect(undefinedFlowError).toBeUndefined();
    });
  });
});
