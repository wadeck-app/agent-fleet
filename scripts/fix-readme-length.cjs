'use strict';
const fs = require('fs');
const path = require('path');

const readmes = [
  'C:/Workspace_Tooling/agent-fleet/packages/orchestrator/README.md',
  'C:/Workspace_Tooling/agent-fleet/packages/orchestrator/src/ui-client/README.md',
  'C:/Workspace_Tooling/agent-fleet/packages/web-backend/src/migrations/README.md',
  'C:/Workspace_Tooling/agent-fleet/packages/web-frontend/src/app/pages/flows/flow-editor/README.md',
  'C:/Workspace_Tooling/agent-fleet/packages/web-frontend/src/app/pages/ingredients/__tests__/README.md',
  'C:/Workspace_Tooling/agent-fleet/packages/web-frontend/src/app/pages/_lego/_2_context-provider/README.md',
  'C:/Workspace_Tooling/agent-fleet/packages/web-frontend/src/framework/features/forms/README.md',
  'C:/Workspace_Tooling/agent-fleet/packages/web-frontend/src/framework/README.md',
  'C:/Workspace_Tooling/agent-fleet/packages/web-frontend/src/framework/tests/README.md',
  'C:/Workspace_Tooling/agent-fleet/README.md',
  'C:/Workspace_Tooling/agent-fleet/scripts/eslint-rules/README.md',
  'C:/Workspace_Tooling/agent-fleet/scripts/README.md',
];

const KEEP_LINES = 45;

for (const readmePath of readmes) {
  const content = fs.readFileSync(readmePath, 'utf8');
  const lines = content.split('\n');
  if (lines.length <= 50) {
    console.log('skipping (already short):', readmePath);
    continue;
  }

  const keepLines = lines.slice(0, KEEP_LINES);
  const restLines = lines.slice(KEEP_LINES);

  // Find satellite doc path
  const dir = path.dirname(readmePath);
  const docsDir = path.join(dir, 'docs');
  const satName = 'reference.md';
  const satPath = path.join(docsDir, satName);
  const relSatPath = 'docs/' + satName;

  fs.mkdirSync(docsDir, { recursive: true });

  // Write satellite doc
  const satContent = `# Reference\n\n_Moved from README — see [README](../README.md) for the overview._\n\n` + restLines.join('\n');
  fs.writeFileSync(satPath, satContent, 'utf8');

  // Truncate README with link
  const truncated = keepLines.join('\n').trimEnd() + '\n\n---\n\n_Reference content moved to [docs/reference.md](' + relSatPath + ')._\n';
  fs.writeFileSync(readmePath, truncated, 'utf8');

  console.log('split:', readmePath, '->', satPath);
}
