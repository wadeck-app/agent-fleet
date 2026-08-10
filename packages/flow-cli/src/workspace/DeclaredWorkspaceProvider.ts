import type { WorkspaceConfig } from 'flow-engine/src/types.js';

export class UnsupportedOperationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UnsupportedOperationError';
	}
}

export class DeclaredWorkspaceProvider {
	constructor(
		private readonly config: WorkspaceConfig,
		private readonly cwd: string
	) {}

	async prepare(): Promise<string> {
		switch (this.config.mode) {
			case 'isolated':
				throw new UnsupportedOperationError("Workspace mode 'isolated' is not supported in v1");
			case 'shared':
			case 'manual':
				return this.cwd;
			default:
				throw new UnsupportedOperationError(`Unknown workspace mode: ${String(this.config.mode)}`);
		}
	}
}
