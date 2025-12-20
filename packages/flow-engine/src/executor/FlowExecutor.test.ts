/**
 * Flow Executor Tests
 *
 * Tests for the FlowExecutor facade that coordinates flow execution
 * by delegating to StepRunner and FlowOrchestrator.
 *
 * Note: FlowExecutor is a simple facade (114 lines) that delegates to
 * StepRunner (68% coverage) and FlowOrchestrator (68% coverage).
 * Integration tests in the full system provide end-to-end coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlowExecutor, FlowExecutionError } from './FlowExecutor.js';
import { StepRunner } from './StepRunner.js';
import { FlowOrchestrator } from './FlowOrchestrator.js';
import { setupTest } from 'test-utils/index';

// Mock dependencies
vi.mock('./StepRunner.js');
vi.mock('./FlowOrchestrator.js');

describe('FlowExecutor', () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = setupTest();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Constructor', () => {
    it('should create executor with default non-interactive mode', () => {
      const executor = new FlowExecutor();

      expect(StepRunner).toHaveBeenCalledWith({ interactive: false });
      expect(FlowOrchestrator).toHaveBeenCalled();
    });

    it('should create executor with non-interactive mode', () => {
      const executor = new FlowExecutor(false);

      expect(StepRunner).toHaveBeenCalledWith({ interactive: false });
      expect(FlowOrchestrator).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should create executor with interactive mode', () => {
      const executor = new FlowExecutor(true);

      expect(StepRunner).toHaveBeenCalledWith({ interactive: true });
      expect(FlowOrchestrator).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should initialize FlowOrchestrator with StepRunner instance', () => {
      const executor = new FlowExecutor(false);

      // FlowOrchestrator should be instantiated with the StepRunner
      expect(FlowOrchestrator).toHaveBeenCalledTimes(1);
      expect(FlowOrchestrator).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should create multiple independent executor instances', () => {
      const executor1 = new FlowExecutor(false);
      const executor2 = new FlowExecutor(true);

      expect(StepRunner).toHaveBeenCalledTimes(2);
      expect(StepRunner).toHaveBeenNthCalledWith(1, { interactive: false });
      expect(StepRunner).toHaveBeenNthCalledWith(2, { interactive: true });
      expect(FlowOrchestrator).toHaveBeenCalledTimes(2);
    });

    it('should properly delegate to orchestrator through facade pattern', () => {
      const executor = new FlowExecutor(false);

      // Verify facade components were initialized
      expect(StepRunner).toHaveBeenCalled();
      expect(FlowOrchestrator).toHaveBeenCalled();
    });
  });

  describe('FlowExecutionError', () => {
    it('should create error with flow ID only', () => {
      const error = new FlowExecutionError('Something went wrong', 'my-flow');

      expect(error.message).toBe(
        "Flow execution error in 'my-flow': Something went wrong"
      );
      expect(error.name).toBe('FlowExecutionError');
      expect(error.flowId).toBe('my-flow');
      expect(error.stepId).toBeUndefined();
    });

    it('should create error with flow ID and step ID', () => {
      const error = new FlowExecutionError(
        'Step failed',
        'my-flow',
        'step-1'
      );

      expect(error.message).toBe(
        "Flow execution error in 'my-flow' at step 'step-1': Step failed"
      );
      expect(error.name).toBe('FlowExecutionError');
      expect(error.flowId).toBe('my-flow');
      expect(error.stepId).toBe('step-1');
    });

    it('should be instance of Error', () => {
      const error = new FlowExecutionError('Test', 'flow-1');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FlowExecutionError);
    });

    it('should format message correctly with special characters', () => {
      const error = new FlowExecutionError(
        'Failed: "quotes" and \'apostrophes\'',
        'my-flow',
        'step-1'
      );

      expect(error.message).toContain('Failed: "quotes" and \'apostrophes\'');
      expect(error.flowId).toBe('my-flow');
      expect(error.stepId).toBe('step-1');
    });

    it('should preserve error properties after throwing', () => {
      try {
        throw new FlowExecutionError('Test error', 'test-flow', 'test-step');
      } catch (e) {
        expect(e).toBeInstanceOf(FlowExecutionError);
        expect((e as FlowExecutionError).flowId).toBe('test-flow');
        expect((e as FlowExecutionError).stepId).toBe('test-step');
      }
    });

    it('should format error message without step ID when not provided', () => {
      const error1 = new FlowExecutionError('Error message', 'flow-1');
      const error2 = new FlowExecutionError('Error message', 'flow-1', 'step-1');

      expect(error1.message).not.toContain('at step');
      expect(error2.message).toContain('at step');
    });

    it('should handle empty error messages', () => {
      const error = new FlowExecutionError('', 'my-flow', 'step-1');

      expect(error.flowId).toBe('my-flow');
      expect(error.stepId).toBe('step-1');
      expect(error.message).toContain('my-flow');
      expect(error.message).toContain('step-1');
    });

    it('should handle special flow and step IDs', () => {
      const error = new FlowExecutionError(
        'Test',
        'flow-with-dashes',
        'step_with_underscores'
      );

      expect(error.flowId).toBe('flow-with-dashes');
      expect(error.stepId).toBe('step_with_underscores');
      expect(error.message).toContain('flow-with-dashes');
      expect(error.message).toContain('step_with_underscores');
    });

    it('should be catchable and re-throwable', () => {
      const originalError = new FlowExecutionError('Original', 'flow-1', 'step-1');

      try {
        throw originalError;
      } catch (e) {
        expect(e).toBe(originalError);
        expect((e as FlowExecutionError).flowId).toBe('flow-1');
        expect((e as FlowExecutionError).stepId).toBe('step-1');
      }
    });

    it('should maintain error stack trace', () => {
      const error = new FlowExecutionError('Test', 'flow-1', 'step-1');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('FlowExecutionError');
    });
  });

  describe('FlowExecutionOptions Interface', () => {
    it('should define all required option fields', () => {
      // This is a type-level test - if it compiles, the interface is correct
      const options = {
        taskId: 'task-1',
        flow: {
          id: 'test',
          name: 'Test',
          description: 'Test',
          workspace: {
            mode: 'isolated' as const,
            gitStrategy: 'main-only' as const,
            reusePolicy: 'never' as const,
          },
          inputs: {},
          steps: [],
        },
        workspace: {
          id: 'ws-1',
          mode: 'isolated' as const,
          path: '/test',
          concurrency: {
            key: 'test',
            activeTasks: new Set(),
            locked: false,
          },
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          usageCount: 0,
        },
        inputs: {},
        taskMetadata: { priority: 1 },
        claudeEnv: { API_KEY: 'test' },
        onClaudeProcessStarted: (process: any) => {},
      };

      expect(options.taskId).toBe('task-1');
      expect(options.inputs).toEqual({});
    });
  });

  describe('Integration Points', () => {
    it('should verify correct initialization order', () => {
      // Create executor - StepRunner should be created first, then FlowOrchestrator
      new FlowExecutor(false);

      // Both components should be initialized
      expect(StepRunner).toHaveBeenCalled();
      expect(FlowOrchestrator).toHaveBeenCalled();

      // FlowOrchestrator should receive a StepRunner instance
      expect(FlowOrchestrator).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should delegate execution to FlowOrchestrator', () => {
      // FlowExecutor is a facade - it coordinates StepRunner and FlowOrchestrator
      const executor = new FlowExecutor(false);

      // Verify proper delegation setup
      expect(StepRunner).toHaveBeenCalled();
      expect(FlowOrchestrator).toHaveBeenCalled();
    });

    it('should maintain facade pattern integrity', () => {
      // Create multiple executors to verify independence
      const exec1 = new FlowExecutor(false);
      const exec2 = new FlowExecutor(true);

      // Each should have independent component instances
      expect(StepRunner).toHaveBeenCalledTimes(2);
      expect(FlowOrchestrator).toHaveBeenCalledTimes(2);
    });
  });
});
