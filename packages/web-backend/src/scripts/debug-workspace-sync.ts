import { createLogger } from 'shared-common/logger';

import { WorkspaceMapper } from '../services/WorkspaceMapper';

const log = createLogger('DebugWorkspaceSync');

// Get the workspace path from .flow
// violations-suppress: shared/no-out-of-repo-path debug script with a hardcoded local path for manual testing only; not used in production code
const workspacePath = 'C:\\Workspace_Tooling\\agent-fleet';

// Generate hash-based ID from path
const hashId = WorkspaceMapper.generateIdFromPath(workspacePath);

log.info(`Workspace Path: ${workspacePath}`);
log.info(`Hash-based ID: ${hashId}`);
log.info('');
log.info('Expected metadata ID from workspace-metadata.json:');
log.info('50115a2e-5226-46d4-9fb8-6f9c11a16f9d');
log.info('');
log.info('Analysis:');
log.info('- If hash ID !== metadata ID, then bidirectional sync will use the WRONG ID');
log.info('- project.workspaceIds will contain hash ID, but frontend uses metadata ID');
log.info('- This causes the workspace to not appear in the project view');
