import type { WorkspaceProvider } from 'extension-points';
import type { FlowDefinition } from 'flow-engine';

import type { ResolvedWorkspaceProvider, WorkspaceProviderSource } from './WorkspaceProviders';

/** A source that serves one provider for every flow: for tests and for embedding the daemon with a provider of your own. */
export class FixedWorkspaceProviders implements WorkspaceProviderSource {
	constructor(private readonly provider: WorkspaceProvider) {}

	async providerFor(_flow: FlowDefinition): Promise<ResolvedWorkspaceProvider> {
		return { provider: this.provider, warnings: [] };
	}
}
