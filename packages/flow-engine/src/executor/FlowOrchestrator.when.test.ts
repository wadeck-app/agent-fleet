/**
 * FlowOrchestrator Tests - 'when' Condition
 *
 * Tests for conditional step execution using the 'when' clause.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FlowOrchestrator } from './FlowOrchestrator.js';
import { StepRunner } from './StepRunner.js';
import { FlowRegistry } from '../registry/FlowRegistry.js';
import { FlowExecutor } from './FlowExecutor.js';
import type { FlowDefinition, Workspace, FlowStep } from '../types.js';
import type { TemplateContext } from '../processing/TemplateRenderer.js';
import { createMockFlow, createMockScriptStep, createMockSubFlowStep } from 'test-utils/index';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('FlowOrchestrator - when condition', () => {
  let orchestrator: FlowOrchestrator;
  let stepRunner: StepRunner;
  let flowRegistry: FlowRegistry;
  let flowExecutor: FlowExecutor;
  let testWorkspace: Workspace;
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for registry
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-test-'));
    const flowsDir = path.join(tempDir, '.agent-fleet');
    fs.mkdirSync(flowsDir, { recursive: true });
    fs.writeFileSync(path.join(flowsDir, 'flows.yml'), '');

    // Setup registry and executor
    flowRegistry = new FlowRegistry(tempDir);
    stepRunner = new StepRunner({ interactive: false });
    flowExecutor = new FlowExecutor(false, flowRegistry);

    // Configure stepRunner with registry and executor
    stepRunner.setFlowRegistry(flowRegistry);
    stepRunner.setFlowExecutor(flowExecutor);

    orchestrator = new FlowOrchestrator(stepRunner);

    testWorkspace = {
      id: 'test-workspace',
      mode: 'manual',
      path: process.cwd(),
      concurrency: {
        key: 'test',
        activeTasks: new Set(),
        locked: false,
      },
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      usageCount: 0,
    };
  });

  // Only run on Windows where we have tested the script executor
  const describeWindows = process.platform === 'win32' ? describe : describe.skip;

  describeWindows('Windows conditional execution', () => {
    it('should skip step when condition evaluates to false', async () => {
      const flow = createMockFlow({
        id: 'test-conditional',
        name: 'Test Conditional',
        description: 'Test when condition',
        workspace: {
          mode: 'manual',
          gitStrategy: 'any',
          reusePolicy: 'always',
        },
        steps: [
          createMockScriptStep({
            id: 'set-flag',
            name: 'Set Flag',
            script: 'echo flag=false',
            output: {
              flag: { type: 'string', pattern: 'flag=(.*)' },
            },
          }),
          createMockScriptStep({
            id: 'should-skip',
            name: 'Should Skip',
            depends: ['set-flag'],
            when: "${{ steps['set-flag'].outputs.flag === 'true' }}",
            script: 'echo This should not execute',
          }),
          createMockScriptStep({
            id: 'always-run',
            name: 'Always Run',
            depends: ['set-flag'],
            script: 'echo This always runs',
          }),
        ],
      });

      const context: TemplateContext = {
        inputs: {},
        stepOutputs: new Map(),
        taskMetadata: {},
      };

      const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

      expect(result.success).toBe(true);
      // should-skip should not have executed (no trace)
      const shouldSkipTrace = result.trace.steps.find((s) => s.stepId === 'should-skip');
      expect(shouldSkipTrace).toBeUndefined();
      // always-run should have executed
      const alwaysRunTrace = result.trace.steps.find((s) => s.stepId === 'always-run');
      expect(alwaysRunTrace).toBeDefined();
    });

    it('should execute step when condition evaluates to true', async () => {
      const flow = createMockFlow({
        id: 'test-conditional-true',
        name: 'Test Conditional True',
        description: 'Test when condition = true',
        workspace: {
          mode: 'manual',
          gitStrategy: 'any',
          reusePolicy: 'always',
        },
        steps: [
          createMockScriptStep({
            id: 'set-flag',
            name: 'Set Flag',
            script: 'echo flag=true',
            output: {
              flag: { type: 'string', pattern: 'flag=(.*)' },
            },
          }),
          createMockScriptStep({
            id: 'should-run',
            name: 'Should Run',
            depends: ['set-flag'],
            when: "${{ steps['set-flag'].outputs.flag === 'true' }}",
            script: 'echo Conditional step executed',
            output: {
              result: { type: 'string', pattern: '(.*)' },
            },
          }),
        ],
      });

      const context: TemplateContext = {
        inputs: {},
        stepOutputs: new Map(),
        taskMetadata: {},
      };

      const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

      expect(result.success).toBe(true);
      // should-run should have executed
      const shouldRunTrace = result.trace.steps.find((s) => s.stepId === 'should-run');
      expect(shouldRunTrace).toBeDefined();
      expect(shouldRunTrace?.error).toBeUndefined();
    });

    it('should stop recursion when condition becomes false', async () => {
      const flow = createMockFlow({
        id: 'test-countdown',
        name: 'Test Countdown',
        description: 'Test recursive flow with exit condition',
        workspace: {
          mode: 'manual',
          gitStrategy: 'any',
          reusePolicy: 'always',
        },
        inputs: {
          count: 'string',
        },
        steps: [
          createMockScriptStep({
            id: 'calculate',
            name: 'Calculate',
            script: 'set /a next=${{ inputs.count }}-1 >nul\necho next=%next%\nif %next% GEQ 0 (echo continue=true) else (echo continue=false)',
            output: {
              next: { type: 'string', pattern: 'next=(.*)' },
              continue: { type: 'string', pattern: 'continue=(.*)' },
            },
          }),
          createMockSubFlowStep({
            id: 'recurse',
            name: 'Recurse',
            flowId: 'test-countdown',
            depends: ['calculate'],
            when: "${{ steps.calculate.outputs.continue === 'true' }}",
            allowRecursion: true,
            inputs: {
              count: '${{ steps.calculate.outputs.next }}',
            },
          }),
        ],
      });

      // Register the flow so it can call itself
      flowRegistry.registerFlow(flow);

      const context: TemplateContext = {
        inputs: { count: '3' },
        stepOutputs: new Map(),
        taskMetadata: {},
      };

      const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

      expect(result.success).toBe(true);

      // At the top level, we should see:
      // - 1 calculate step (count=3)
      // - 1 recurse step (which contains nested recursion)
      const topLevelSteps = result.trace.steps;
      expect(topLevelSteps.length).toBe(2);

      const calculateTrace = topLevelSteps.find((s) => s.stepId === 'calculate');
      expect(calculateTrace).toBeDefined();
      expect(calculateTrace?.outputs?.next).toBe('2');
      expect(calculateTrace?.outputs?.continue).toBe('true');

      const recurseTrace = topLevelSteps.find((s) => s.stepId === 'recurse');
      expect(recurseTrace).toBeDefined();
      expect(recurseTrace?.error).toBeUndefined();

      // The recursion should have stopped at count=0 (when next=-1, continue=false)
      // This is validated by the flow completing successfully without hitting max depth
    });
  });
});
