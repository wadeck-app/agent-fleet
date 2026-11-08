import { WorkspaceDeclarationParser } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine';

/** The workspace provider kind of a flow, as the sources' `workspaces` name it. */
export class FlowWorkspaceKind {
	/**
	 * `in-place`, `readonly`, `worktree`, `pool`, or the name of a configured provider instance, from `workspace:` (the
	 * object form by its `provider`). The deprecated `plugins.workspace` stands for the instance it uses.
	 *
	 * @returns undefined when the flow declares no readable kind (the validator refuses such a flow before it gets here)
	 */
	static of(flow: Pick<FlowDefinition, 'workspace' | 'plugins'>): string | undefined {
		if ((flow.workspace === undefined || flow.workspace === null) && flow.plugins?.workspace !== undefined) {
			const used = (flow.plugins.workspace as { use?: unknown }).use;
			return typeof used === 'string' ? used : undefined;
		}
		const parsed = WorkspaceDeclarationParser.parse(flow.workspace);
		return parsed.ok ? parsed.spec.provider : undefined;
	}
}
