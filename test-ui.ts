#!/usr/bin/env tsx
/**
 * Test script to reproduce UI jumping issues
 * Run with: npm run test-ui
 */

import { createFlowWorkerUI as createInkUI } from './src/workers/flow/ui/ink/FlowWorkerUI.js';
import { createFlowWorkerUI as createTerminalKitUI } from './src/workers/flow/ui/terminal-kit/FlowWorkerUI.js';
import type { StepInfo } from './src/workers/flow/ui/shared/types.js';

const uiEngine = process.env.UI_ENGINE || 'ink';

console.log(`Starting UI test with engine: ${uiEngine}`);
console.log('This will simulate a flow execution with frequent updates.');
console.log('Press Q to quit, P to pause/resume, 1-5 to switch views');
console.log('Watch for any visual "jumping" or flickering\n');

const ui = uiEngine === 'terminal-kit'
  ? createTerminalKitUI('test-worker-1', 'ws://localhost:3738')
  : createInkUI('test-worker-1', 'ws://localhost:3738');
const stateManager = ui.getStateManager();

// Simulate connection
stateManager.setConnected(true);
stateManager.setWorkerId('test-worker-1');

// Start UI
ui.start();

// Simulate a flow execution with multiple steps
setTimeout(() => {
  const steps: StepInfo[] = [
    { id: 'step-1', name: 'Initialize Environment', type: 'script', status: 'pending' },
    { id: 'step-2', name: 'Run Security Audit', type: 'script', status: 'pending' },
    { id: 'step-3', name: 'Execute Code Linting', type: 'script', status: 'pending' },
    { id: 'step-4', name: 'Run Test Suite', type: 'script', status: 'pending' },
    { id: 'step-5', name: 'Deploy to Production', type: 'script', status: 'pending' },
    { id: 'step-6', name: 'Verify Deployment', type: 'script', status: 'pending' },
  ];

  stateManager.startTask(
    'test-task-12345678-1234-1234-1234-123456789abc',
    'test-flow',
    'Test: Multi-Review with Skip and Reset Pattern',
    steps
  );

  stateManager.setWorkspace('C:\\Workspace_Tooling\\agent-fleet');

  // Initial logs are already added by startTask, no need to duplicate

  // Simulate step execution
  let currentStep = 0;
  const executeNextStep = () => {
    if (currentStep >= steps.length) {
      stateManager.taskCompleted();
      return;
    }

    const step = steps[currentStep];
    // stepStarted() already adds a log, no need to add manually
    stateManager.stepStarted(step.id);

    // Simulate step taking 3-5 seconds
    const duration = 3000 + Math.random() * 2000;
    setTimeout(() => {
      if (Math.random() > 0.8) {
        // 20% chance of failure
        stateManager.stepFailed(step.id, 'Random test failure', duration);
      } else {
        stateManager.stepCompleted(step.id, duration);
      }
      currentStep++;
      setTimeout(executeNextStep, 500);
    }, duration);
  };

  setTimeout(executeNextStep, 2000);
}, 1000);
