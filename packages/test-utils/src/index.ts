/**
 * Test Utils
 *
 * Centralized test utilities for Agent Fleet.
 * Import from here to get all test helpers in one place.
 *
 * @example
 * ```typescript
 * import {
 *   createMockTask,
 *   MockIssueCollector,
 *   setupTimers,
 * } from '../test-utils.js';
 * ```
 */

// Export factories
export {
  createMockTask,
  createMockFlow,
  createMockWorkspace,
  createMockWorker,
  createMockStepTrace,
  createMockFlowTrace,
  createMockFlowResult,
  createMockModelStep,
  createMockScriptStep,
  createMockSubFlowStep,
  createMockTasks,
  createMockWorkers,
  mockStepExecution,
  createTestStep,
} from './factories.js';

// Export mocks
export {
  MockIssueCollector,
  MockFlowRegistry,
  MockWebSocket,
  MockChildProcess,
  createMockLogger,
  createConsoleMocks,
  createMockTaskManager,
  createMockStateManager,
  createMockWorkspaceManager,
  createMockFlowExecutor,
  createMockConnectionManager,
} from './mocks.js';

// Export helpers
export {
  setupTimers,
  setupConsoleMocks,
  createTempTestDir,
  waitForCondition,
  sleep,
  fileExists,
  directoryExists,
  readJsonFile,
  writeJsonFile,
  mockEnvVars,
  captureConsoleOutput,
  assertThrowsAsync,
  spyOnModule,
  flushPromises,
  withTimeout,
  createDeferred,
  retry,
  createTrackedMock,
  setupTest,
  mockPlatform,
} from './helpers.js';

// Export REST API helpers
export { testEndpoint, testCRUDEndpoint } from './rest-api-helpers.js';
export type { TestEndpointOptions } from './rest-api-helpers.js';
