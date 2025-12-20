/**
 * Tests for GraphValidator
 *
 * Tests graph structure validation including:
 * - Cycle detection in step dependencies
 * - Reachability checking
 * - Circular subflow dependency detection
 * - DAG structure validation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GraphValidator } from './GraphValidator.js';
import type { FlowStep, SubFlowStep, FlowDefinition } from '../types.js';
import { ValidationCode } from './ValidationTypes.js';
import { MockIssueCollector, MockFlowRegistry } from 'test-utils/index';

describe('GraphValidator', () => {
  let collector: MockIssueCollector;
  let registry: MockFlowRegistry;
  let validator: GraphValidator;

  beforeEach(() => {
    collector = new MockIssueCollector();
    registry = new MockFlowRegistry();
    validator = new GraphValidator(collector, registry as any);
  });

  describe('Cycle Detection', () => {
    it('should detect direct circular dependency (A → A)', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'stepA',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepA'], // Self-dependency
        },
      ];

      validator.validateGraph(steps);

      // Detects both circular dependency and no root steps (2 errors)
      expect(collector.getErrors().length).toBeGreaterThanOrEqual(1);
      expect(collector.hasCode(ValidationCode.CIRCULAR_DEPENDENCY)).toBe(true);
      const cycleError = collector.issues.find(i => i.code === ValidationCode.CIRCULAR_DEPENDENCY);
      expect(cycleError?.message).toContain('Circular dependency detected');
    });

    it('should detect simple cycle (A → B → A)', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'stepA',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepB'],
        },
        {
          type: 'model',
          id: 'stepB',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepA'],
        },
      ];

      validator.validateGraph(steps);

      // Detects both circular dependency and no root steps (2 errors)
      expect(collector.getErrors().length).toBeGreaterThanOrEqual(1);
      expect(collector.hasCode(ValidationCode.CIRCULAR_DEPENDENCY)).toBe(true);
      const cycleError = collector.issues.find(i => i.code === ValidationCode.CIRCULAR_DEPENDENCY);
      const cycle = cycleError?.context?.related;
      expect(cycle).toBeDefined();
      expect(cycle).toContain('stepA');
      expect(cycle).toContain('stepB');
    });

    it('should detect complex cycle (A → B → C → A)', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'stepA',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepB'],
        },
        {
          type: 'model',
          id: 'stepB',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepC'],
        },
        {
          type: 'model',
          id: 'stepC',
          name: 'Step C',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepA'],
        },
      ];

      validator.validateGraph(steps);

      // Detects both circular dependency and no root steps (2 errors)
      expect(collector.getErrors().length).toBeGreaterThanOrEqual(1);
      expect(collector.hasCode(ValidationCode.CIRCULAR_DEPENDENCY)).toBe(true);
    });

    it('should not report cycles in valid DAG', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'stepA',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'model',
          id: 'stepB',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepA'],
        },
        {
          type: 'model',
          id: 'stepC',
          name: 'Step C',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepA'],
        },
        {
          type: 'model',
          id: 'stepD',
          name: 'Step D',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepB', 'stepC'],
        },
      ];

      validator.validateGraph(steps);

      expect(collector.getErrors()).toHaveLength(0);
    });

    it('should handle steps with no dependencies', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'stepA',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'model',
          id: 'stepB',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
        },
      ];

      validator.validateGraph(steps);

      expect(collector.getErrors()).toHaveLength(0);
    });
  });

  describe('Reachability Checking', () => {
    it('should detect unreachable steps', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'stepA',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'model',
          id: 'stepB',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepA'],
        },
        {
          type: 'model',
          id: 'stepC',
          name: 'Step C (unreachable)',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepX'], // Non-existent dependency
        },
      ];

      validator.validateGraph(steps);

      const warnings = collector.getWarnings();
      expect(warnings.length).toBeGreaterThan(0);
      expect(collector.hasCode(ValidationCode.UNREACHABLE_STEP)).toBe(true);
      expect(warnings.some(w => w.message.includes('stepC'))).toBe(true);
    });

    it('should not report reachable steps as unreachable', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'stepA',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'model',
          id: 'stepB',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepA'],
        },
        {
          type: 'model',
          id: 'stepC',
          name: 'Step C',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepB'],
        },
      ];

      validator.validateGraph(steps);

      expect(collector.hasCode(ValidationCode.UNREACHABLE_STEP)).toBe(false);
    });

    it('should detect when all steps have dependencies (no root)', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'stepA',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepB'],
        },
        {
          type: 'model',
          id: 'stepB',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
          depends: ['stepA'],
        },
      ];

      validator.validateGraph(steps);

      // Detects both circular dependency and no root steps (2 errors)
      expect(collector.getErrors()).toHaveLength(2);
      expect(collector.hasCode(ValidationCode.CIRCULAR_DEPENDENCY)).toBe(true);
      const rootError = collector.issues.find(i => i.message.includes('No root steps found'));
      expect(rootError?.message).toContain('No root steps found');
    });

    it('should handle multiple root nodes', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'root1',
          name: 'Root 1',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'model',
          id: 'root2',
          name: 'Root 2',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'model',
          id: 'child',
          name: 'Child',
          model: 'haiku',
          prompt: 'test',
          depends: ['root1', 'root2'],
        },
      ];

      validator.validateGraph(steps);

      expect(collector.getErrors()).toHaveLength(0);
      expect(collector.hasCode(ValidationCode.UNREACHABLE_STEP)).toBe(false);
    });

    it('should handle empty step list', () => {
      const steps: FlowStep[] = [];

      validator.validateGraph(steps);

      expect(collector.issues).toHaveLength(0);
    });
  });

  describe('Subflow Circularity Validation', () => {
    it('should detect direct self-reference without allowRecursion', () => {
      const step: SubFlowStep = {
        type: 'subflow',
        id: 'recursive-step',
        name: 'Recursive Step',
        flowId: 'my-flow',
        inputs: {},
      };

      const isCircular = validator.validateSubFlowCircularity(step, 'my-flow');

      expect(isCircular).toBe(true);
      expect(collector.getErrors()).toHaveLength(1);
      expect(collector.hasCode(ValidationCode.CIRCULAR_SUBFLOW_REFERENCE)).toBe(true);
      expect(collector.issues[0].message).toContain('creates circular reference');
    });

    it('should allow direct self-reference with allowRecursion', () => {
      const step: SubFlowStep = {
        type: 'subflow',
        id: 'recursive-step',
        name: 'Recursive Step',
        flowId: 'my-flow',
        inputs: {},
        allowRecursion: true,
      };

      const isCircular = validator.validateSubFlowCircularity(step, 'my-flow');

      expect(isCircular).toBe(false);
      expect(collector.getErrors()).toHaveLength(0);
      expect(collector.getWarnings()).toHaveLength(1);
      expect(collector.issues[0].message).toContain('is recursive');
      expect(collector.issues[0].message).toContain('when');
    });

    it('should detect deep circular dependency chain (A → B → A)', () => {
      // Flow A calls Flow B
      const flowA: FlowDefinition = {
        id: 'flow-a',
        version: '1.0.0',
        name: 'Flow A',
        description: 'Test',
        workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'subflow',
            id: 'call-b',
            name: 'Call B',
            flowId: 'flow-b',
            inputs: {},
          },
        ],
      };

      // Flow B calls Flow A (circular!)
      const flowB: FlowDefinition = {
        id: 'flow-b',
        version: '1.0.0',
        name: 'Flow B',
        description: 'Test',
        workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'subflow',
            id: 'call-a',
            name: 'Call A',
            flowId: 'flow-a',
            inputs: {},
          },
        ],
      };

      registry.addFlow(flowA);
      registry.addFlow(flowB);

      const step: SubFlowStep = {
        type: 'subflow',
        id: 'test-step',
        name: 'Test Step',
        flowId: 'flow-b',
        inputs: {},
      };

      const isCircular = validator.validateSubFlowCircularity(step, 'flow-a');

      expect(isCircular).toBe(true);
      expect(collector.getErrors()).toHaveLength(1);
      expect(collector.hasCode(ValidationCode.CIRCULAR_SUBFLOW_REFERENCE)).toBe(true);
      expect(collector.issues[0].message).toContain('circular dependency chain');
      expect(collector.issues[0].message).toContain('flow-b');
      expect(collector.issues[0].message).toContain('flow-a');
    });

    it('should detect complex circular chain (A → B → C → A)', () => {
      const flowA: FlowDefinition = {
        id: 'flow-a',
        version: '1.0.0',
        name: 'Flow A',
        description: 'Test',
        workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'subflow',
            id: 'call-b',
            name: 'Call B',
            flowId: 'flow-b',
            inputs: {},
          },
        ],
      };

      const flowB: FlowDefinition = {
        id: 'flow-b',
        version: '1.0.0',
        name: 'Flow B',
        description: 'Test',
        workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'subflow',
            id: 'call-c',
            name: 'Call C',
            flowId: 'flow-c',
            inputs: {},
          },
        ],
      };

      const flowC: FlowDefinition = {
        id: 'flow-c',
        version: '1.0.0',
        name: 'Flow C',
        description: 'Test',
        workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'subflow',
            id: 'call-a',
            name: 'Call A',
            flowId: 'flow-a',
            inputs: {},
          },
        ],
      };

      registry.addFlow(flowA);
      registry.addFlow(flowB);
      registry.addFlow(flowC);

      const step: SubFlowStep = {
        type: 'subflow',
        id: 'test-step',
        name: 'Test Step',
        flowId: 'flow-b',
        inputs: {},
      };

      const isCircular = validator.validateSubFlowCircularity(step, 'flow-a');

      expect(isCircular).toBe(true);
      expect(collector.getErrors()).toHaveLength(1);
      expect(collector.hasCode(ValidationCode.CIRCULAR_SUBFLOW_REFERENCE)).toBe(true);
    });

    it('should not detect circularity in valid chain (A → B → C)', () => {
      const flowB: FlowDefinition = {
        id: 'flow-b',
        version: '1.0.0',
        name: 'Flow B',
        description: 'Test',
        workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'subflow',
            id: 'call-c',
            name: 'Call C',
            flowId: 'flow-c',
            inputs: {},
          },
        ],
      };

      const flowC: FlowDefinition = {
        id: 'flow-c',
        version: '1.0.0',
        name: 'Flow C',
        description: 'Test',
        workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
        inputs: {},
        steps: [
          {
            type: 'model',
            id: 'end',
            name: 'End',
            model: 'haiku',
            prompt: 'done',
          },
        ],
      };

      registry.addFlow(flowB);
      registry.addFlow(flowC);

      const step: SubFlowStep = {
        type: 'subflow',
        id: 'test-step',
        name: 'Test Step',
        flowId: 'flow-b',
        inputs: {},
      };

      const isCircular = validator.validateSubFlowCircularity(step, 'flow-a');

      expect(isCircular).toBe(false);
      expect(collector.getErrors()).toHaveLength(0);
    });

    it('should handle missing flow in registry gracefully', () => {
      const step: SubFlowStep = {
        type: 'subflow',
        id: 'test-step',
        name: 'Test Step',
        flowId: 'non-existent-flow',
        inputs: {},
      };

      const isCircular = validator.validateSubFlowCircularity(step, 'flow-a');

      expect(isCircular).toBe(false);
      expect(collector.getErrors()).toHaveLength(0);
    });

    it('should work without flow registry', () => {
      const validatorNoRegistry = new GraphValidator(collector);

      const step: SubFlowStep = {
        type: 'subflow',
        id: 'test-step',
        name: 'Test Step',
        flowId: 'some-flow',
        inputs: {},
      };

      const isCircular = validatorNoRegistry.validateSubFlowCircularity(step, 'my-flow');

      expect(isCircular).toBe(false);
      expect(collector.getErrors()).toHaveLength(0);
    });
  });

  describe('Complex Graph Scenarios', () => {
    it('should validate diamond dependency (A → B, A → C, B → D, C → D)', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'A',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'model',
          id: 'B',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
          depends: ['A'],
        },
        {
          type: 'model',
          id: 'C',
          name: 'Step C',
          model: 'haiku',
          prompt: 'test',
          depends: ['A'],
        },
        {
          type: 'model',
          id: 'D',
          name: 'Step D',
          model: 'haiku',
          prompt: 'test',
          depends: ['B', 'C'],
        },
      ];

      validator.validateGraph(steps);

      expect(collector.getErrors()).toHaveLength(0);
      expect(collector.hasCode(ValidationCode.UNREACHABLE_STEP)).toBe(false);
    });

    it('should handle mixed step types in graph', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'step1',
          name: 'Model Step',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'script',
          id: 'step2',
          name: 'Script Step',
          script: 'echo test',
          depends: ['step1'],
        },
        {
          type: 'subflow',
          id: 'step3',
          name: 'SubFlow Step',
          flowId: 'other-flow',
          inputs: {},
          depends: ['step2'],
        },
      ];

      validator.validateGraph(steps);

      expect(collector.getErrors()).toHaveLength(0);
    });

    it('should detect partial cycles in complex graph', () => {
      const steps: FlowStep[] = [
        {
          type: 'model',
          id: 'root',
          name: 'Root',
          model: 'haiku',
          prompt: 'test',
        },
        {
          type: 'model',
          id: 'A',
          name: 'Step A',
          model: 'haiku',
          prompt: 'test',
          depends: ['root', 'B'],
        },
        {
          type: 'model',
          id: 'B',
          name: 'Step B',
          model: 'haiku',
          prompt: 'test',
          depends: ['A'],
        },
      ];

      validator.validateGraph(steps);

      expect(collector.getErrors()).toHaveLength(1);
      expect(collector.hasCode(ValidationCode.CIRCULAR_DEPENDENCY)).toBe(true);
    });
  });
});
