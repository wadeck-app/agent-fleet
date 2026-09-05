'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Workspace_Tooling/agent-fleet';

// Restore these files from HEAD (they were corrupted by emoji regex removing digits)
const toRestore = [
  'packages/flow-engine/src/executor/FlowOrchestrator.ts',
  'packages/flow-engine/src/executor/ModelStepExecutor.ts',
  'packages/flow-engine/src/executor/ScriptExecutor.ts',
  'packages/flow-engine/src/executor/StepRunner.ts',
  'packages/flow-engine/src/executor/SubflowStepExecutor.ts',
  'packages/flow-engine/src/executor/UserInterventionStepExecutor.ts',
  'packages/flow-engine/src/orchestration/FlowScheduler.ts',
  'packages/flow-engine/src/processing/ClaudeModelProvider.ts',
  'packages/flow-engine/src/processing/ConditionEvaluator.ts',
  'packages/flow-engine/src/processing/LoopHandler.ts',
  'packages/flow-engine/src/processing/OpenCodeModelProvider.ts',
  'packages/flow-engine/src/processing/OutputExtractor.ts',
  'packages/flow-engine/src/registry/FlowRegistry.ts',
  'packages/flow-engine/src/types.ts',
  'packages/flow-engine/src/workspace/WorkspaceManager.ts',
  'packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts',
  'packages/web-frontend/src/framework/components/columns/ColumnVisibility.tsx',
  'packages/web-frontend/src/framework/components/layout/Page.tsx',
  'packages/web-frontend/src/test/utils/asyncUtils.ts',
];

for (const rel of toRestore) {
  try {
    const original = execSync(`git show HEAD:${rel}`, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
    fs.writeFileSync(path.join(ROOT, rel), original);
    console.log(`restored: ${rel}`);
  } catch(e) {
    console.log(`skip (not in HEAD): ${rel}`);
  }
}
console.log('Done');
