/**
 * Flow Engine Demo
 *
 * This demo shows how to use the Flow Engine with various features:
 * - Variable interpolation with GitHub Actions syntax
 * - Conditional transitions
 * - Output extraction
 * - Multi-step workflows
 */

import { FlowExecutor } from '../src/flow/flow-executor.js';
import type { FlowDefinition, Workspace } from '../src/flow/types.js';

/**
 * Create a mock workspace for the demo
 */
function createMockWorkspace(): Workspace {
  return {
    id: 'demo-workspace',
    path: process.cwd(),
    mode: 'isolated',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    usageCount: 1,
  };
}

/**
 * Demo 1: Simple Variable Interpolation
 */
async function demo1_SimpleInterpolation() {
  console.log('\n========================================');
  console.log('Demo 1: Simple Variable Interpolation');
  console.log('========================================\n');

  const executor = new FlowExecutor();
  const workspace = createMockWorkspace();

  const flow: FlowDefinition = {
    id: 'demo-1',
    name: 'Simple Interpolation',
    description: 'Demo of variable interpolation',
    workspace: {
      mode: 'isolated',
      gitStrategy: 'main-only',
      reusePolicy: 'never',
    },
    inputs: {
      username: 'string',
      count: 'number',
    },
    steps: [
      {
        type: 'script',
        id: 'greet',
        name: 'Greet User',
        script: 'echo "Hello ${{ inputs.username }}, you have ${{ inputs.count }} messages"',
      },
    ],
  };

  const result = await executor.execute({
    taskId: 'demo-1',
    flow,
    workspace,
    inputs: {
      username: 'Alice',
      count: 5,
    },
  });

  console.log('✓ Flow completed:', result.success);
  console.log('Output:', result.trace.steps[0].stdout.trim());
}

/**
 * Demo 2: Output Extraction and Passing
 */
async function demo2_OutputExtraction() {
  console.log('\n========================================');
  console.log('Demo 2: Output Extraction and Passing');
  console.log('========================================\n');

  const executor = new FlowExecutor();
  const workspace = createMockWorkspace();

  const flow: FlowDefinition = {
    id: 'demo-2',
    name: 'Output Extraction',
    description: 'Demo of output extraction with transforms',
    workspace: {
      mode: 'isolated',
      gitStrategy: 'main-only',
      reusePolicy: 'never',
    },
    inputs: {},
    steps: [
      {
        type: 'script',
        id: 'generate-data',
        name: 'Generate Data',
        script: 'echo "Count: 42"',
        output: {
          count: {
            type: 'number',
            pattern: 'Count: (\\d+)',
            transform: 'parseInt',
          },
        },
        next: {
          default: 'use-data',
        },
      },
      {
        type: 'script',
        id: 'use-data',
        name: 'Use Data',
        script: 'echo "The count is ${{ steps.generate-data.outputs.count }}"',
      },
    ],
  };

  const result = await executor.execute({
    taskId: 'demo-2',
    flow,
    workspace,
    inputs: {},
  });

  console.log('✓ Flow completed:', result.success);
  console.log('Step 1 output (raw):', result.trace.steps[0].stdout.trim());
  console.log('Step 1 extracted:', result.outputs['generate-data']);
  console.log('Step 2 output:', result.trace.steps[1].stdout.trim());
}

/**
 * Demo 3: Conditional Branching
 */
async function demo3_ConditionalBranching() {
  console.log('\n========================================');
  console.log('Demo 3: Conditional Branching');
  console.log('========================================\n');

  const executor = new FlowExecutor();
  const workspace = createMockWorkspace();

  const flow: FlowDefinition = {
    id: 'demo-3',
    name: 'Conditional Flow',
    description: 'Demo of conditional transitions',
    workspace: {
      mode: 'isolated',
      gitStrategy: 'main-only',
      reusePolicy: 'never',
    },
    inputs: {
      value: 'number',
    },
    steps: [
      {
        type: 'script',
        id: 'check-value',
        name: 'Check Value',
        script: 'echo "Value: ${{ inputs.value }}"',
        output: {
          value: {
            type: 'number',
            pattern: 'Value: (\\d+)',
            transform: 'parseInt',
          },
        },
        next: {
          conditions: [
            { when: 'output.value > 50', goto: 'high-path' },
            { when: 'output.value < 50', goto: 'low-path' },
          ],
          default: 'equal-path',
        },
      },
      {
        type: 'script',
        id: 'high-path',
        name: 'High Value',
        script: 'echo "High: ${{ steps.check-value.outputs.value }} is greater than 50"',
      },
      {
        type: 'script',
        id: 'low-path',
        name: 'Low Value',
        script: 'echo "Low: ${{ steps.check-value.outputs.value }} is less than 50"',
      },
      {
        type: 'script',
        id: 'equal-path',
        name: 'Equal Value',
        script: 'echo "Equal: ${{ steps.check-value.outputs.value }} equals 50"',
      },
    ],
  };

  // Test with high value
  console.log('--- Test 1: High Value (75) ---');
  const result1 = await executor.execute({
    taskId: 'demo-3-high',
    flow,
    workspace,
    inputs: { value: 75 },
  });
  console.log('✓ Flow completed:', result1.success);
  console.log('Path taken:', result1.trace.steps[1].stepId);
  console.log('Output:', result1.trace.steps[1].stdout.trim());

  // Test with low value
  console.log('\n--- Test 2: Low Value (25) ---');
  const result2 = await executor.execute({
    taskId: 'demo-3-low',
    flow,
    workspace,
    inputs: { value: 25 },
  });
  console.log('✓ Flow completed:', result2.success);
  console.log('Path taken:', result2.trace.steps[1].stepId);
  console.log('Output:', result2.trace.steps[1].stdout.trim());

  // Test with equal value
  console.log('\n--- Test 3: Equal Value (50) ---');
  const result3 = await executor.execute({
    taskId: 'demo-3-equal',
    flow,
    workspace,
    inputs: { value: 50 },
  });
  console.log('✓ Flow completed:', result3.success);
  console.log('Path taken:', result3.trace.steps[1].stepId);
  console.log('Output:', result3.trace.steps[1].stdout.trim());
}

/**
 * Demo 4: Task Metadata Access
 */
async function demo4_TaskMetadata() {
  console.log('\n========================================');
  console.log('Demo 4: Task Metadata Access');
  console.log('========================================\n');

  const executor = new FlowExecutor();
  const workspace = createMockWorkspace();

  const flow: FlowDefinition = {
    id: 'demo-4',
    name: 'Task Metadata',
    description: 'Demo of task metadata usage',
    workspace: {
      mode: 'isolated',
      gitStrategy: 'main-only',
      reusePolicy: 'never',
    },
    inputs: {},
    steps: [
      {
        type: 'script',
        id: 'check-priority',
        name: 'Check Priority',
        script: 'echo "Task priority: ${{ task.priority }}"',
        next: {
          conditions: [{ when: "task.priority === 'high'", goto: 'urgent' }],
          default: 'normal',
        },
      },
      {
        type: 'script',
        id: 'urgent',
        name: 'Urgent Processing',
        script: 'echo "🚨 URGENT: Processing high priority task"',
      },
      {
        type: 'script',
        id: 'normal',
        name: 'Normal Processing',
        script: 'echo "📝 Normal: Processing regular task"',
      },
    ],
  };

  // Test with high priority
  console.log('--- Test 1: High Priority ---');
  const result1 = await executor.execute({
    taskId: 'demo-4-high',
    flow,
    workspace,
    inputs: {},
    taskMetadata: {
      priority: 'high',
      createdAt: new Date().toISOString(),
    },
  });
  console.log('✓ Flow completed:', result1.success);
  console.log('Output:', result1.trace.steps[1].stdout.trim());

  // Test with normal priority
  console.log('\n--- Test 2: Normal Priority ---');
  const result2 = await executor.execute({
    taskId: 'demo-4-normal',
    flow,
    workspace,
    inputs: {},
    taskMetadata: {
      priority: 'normal',
      createdAt: new Date().toISOString(),
    },
  });
  console.log('✓ Flow completed:', result2.success);
  console.log('Output:', result2.trace.steps[1].stdout.trim());
}

/**
 * Demo 5: Complex Pipeline
 */
async function demo5_ComplexPipeline() {
  console.log('\n========================================');
  console.log('Demo 5: Complex Pipeline');
  console.log('========================================\n');

  const executor = new FlowExecutor();
  const workspace = createMockWorkspace();

  const flow: FlowDefinition = {
    id: 'demo-5',
    name: 'Complex Pipeline',
    description: 'Demo of a multi-step pipeline with all features',
    workspace: {
      mode: 'isolated',
      gitStrategy: 'main-only',
      reusePolicy: 'never',
    },
    inputs: {
      dataSource: 'string',
    },
    steps: [
      {
        type: 'script',
        id: 'fetch',
        name: 'Fetch Data',
        script: 'echo "Fetching from ${{ inputs.dataSource }}..."',
        output: {
          status: { type: 'string', pattern: 'Fetching from (.*)\\.\\.\\.' },
        },
        next: { default: 'validate' },
      },
      {
        type: 'script',
        id: 'validate',
        name: 'Validate Data',
        script: 'echo "Items: 42"',
        output: {
          itemCount: {
            type: 'number',
            pattern: 'Items: (\\d+)',
            transform: 'parseInt',
          },
        },
        next: {
          conditions: [
            { when: 'output.itemCount === 0', goto: 'no-data' },
            { when: 'output.itemCount > 0', goto: 'process' },
          ],
        },
      },
      {
        type: 'script',
        id: 'process',
        name: 'Process Data',
        script: 'echo "Processing ${{ steps.validate.outputs.itemCount }} items from ${{ steps.fetch.outputs.status }}"',
        next: { default: 'complete' },
      },
      {
        type: 'script',
        id: 'no-data',
        name: 'Handle No Data',
        script: 'echo "No data found"',
        next: { default: 'complete' },
      },
      {
        type: 'script',
        id: 'complete',
        name: 'Complete',
        script: 'echo "Pipeline complete ✓"',
      },
    ],
  };

  const result = await executor.execute({
    taskId: 'demo-5',
    flow,
    workspace,
    inputs: {
      dataSource: 'https://api.example.com/data',
    },
  });

  console.log('✓ Flow completed:', result.success);
  console.log('\nExecution trace:');
  result.trace.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step.stepName}: ${step.stdout.trim()}`);
  });
  console.log('\nExtracted outputs:');
  console.log('  fetch.status:', result.outputs['fetch'].status);
  console.log('  validate.itemCount:', result.outputs['validate'].itemCount);
}

/**
 * Run all demos
 */
async function runAllDemos() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║    Flow Engine Demo Suite              ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    await demo1_SimpleInterpolation();
    await demo2_OutputExtraction();
    await demo3_ConditionalBranching();
    await demo4_TaskMetadata();
    await demo5_ComplexPipeline();

    console.log('\n========================================');
    console.log('✓ All demos completed successfully!');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run demos if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllDemos();
}

export {
  demo1_SimpleInterpolation,
  demo2_OutputExtraction,
  demo3_ConditionalBranching,
  demo4_TaskMetadata,
  demo5_ComplexPipeline,
};
