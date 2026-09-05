// violations-suppress: ts/no-barrel-index public API entry point for workspace package -- 27 import sites
// Convenience re-export of latest extension point interfaces per spec.
export type { WorkspaceProvider, WorkspaceRequest, WorkspaceHandle } from './workspace/v1.js';
export type { ApprovalProvider, InputRequest, ChoiceRequest, ApprovalRequest } from './approval/v1.js';
export type { PluginManifest, PluginImplementation } from './manifest.js';
export { SENSITIVE_FIELDS } from './sensitiveFields.js';
export {
	validateWorkspacePath,
	validateBaseDir,
	validateTaskIdForBranchName,
	validateBranchNamePrefix,
} from './pathValidation.js';
export { releaseWorkspace } from './releaseWorkspace.js';
