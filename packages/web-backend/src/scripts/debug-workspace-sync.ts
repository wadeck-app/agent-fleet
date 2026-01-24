import { WorkspaceMapper } from '../services/WorkspaceMapper';

// Get the workspace path from .agent-fleet
const workspacePath = 'C:\\Workspace_Tooling\\agent-fleet';

// Generate hash-based ID from path
const hashId = WorkspaceMapper.generateIdFromPath(workspacePath);

console.log('Workspace Path:', workspacePath);
console.log('Hash-based ID:', hashId);
console.log('');
console.log('Expected metadata ID from workspace-metadata.json:');
console.log('50115a2e-5226-46d4-9fb8-6f9c11a16f9d');
console.log('');
console.log('Analysis:');
console.log('- If hash ID !== metadata ID, then bidirectional sync will use the WRONG ID');
console.log('- project.workspaceIds will contain hash ID, but frontend uses metadata ID');
console.log('- This causes the workspace to not appear in the project view');
