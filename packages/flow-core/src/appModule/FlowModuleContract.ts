// What the flow module offers to the modules that extend or link to it. Single source: the flow module's manifest
// test asserts its manifest.json against it, and the modules that fill its slots or link to its pages (flow-chart)
// assert their manifests and views against it, so neither reads the other's files.
import { FLOW_APP_MODULE_ID } from './AppModuleIds.js';

// One look for every action next to an execution (detail header, executions page, expanded row, chart header): a
// small secondary navigating button. The platform (app-core check and load) validates only the ROOT $type of a
// contribution, never its props, and a ButtonLink takes variant and size, so a slot that accepted ButtonLink could not
// stop a contributor from restyling it. The slots therefore accept one component whose style is not a prop:
// flow-chart:FlowChartLink renders FLOW_ACTION_BUTTON_STYLE and refuses any key it does not declare. The flow module's
// own buttons are plain ButtonLinks, and its tests assert this same constant. To let another module contribute, add
// its component here once it renders FLOW_ACTION_BUTTON_STYLE and rejects unknown keys.
// "*" on purpose: app-core matches with includePrerelease, and CI stamps prereleases like 2026.10.19-663-3ea4c829.
/** The `requires` range of a module that fills the slots of the flow module (its manifest `requires.flow`). */
export const FLOW_REQUIRED_RANGE = '*';

/** Props of every action button (dsl-ui ButtonLink) shown next to an execution. */
export const FLOW_ACTION_BUTTON_STYLE = { variant: 'secondary', size: 'sm' } as const;

/** Root `$type`s a contribution to any action slot may have; a namespaced $type is accepted only as this exact string. */
export const FLOW_ACTION_SLOT_ACCEPTS: readonly string[] = ['flow-chart:FlowChartLink'];

/** Extension slots the flow module exposes (manifest `expose.slots`): slot name, without the `flow:` prefix a contributor writes -> root `$type`s it accepts. */
export const FLOW_EXPOSED_SLOTS: Readonly<Record<string, readonly string[]>> = {
	'execution-actions': FLOW_ACTION_SLOT_ACCEPTS,
	'executions-actions': FLOW_ACTION_SLOT_ACCEPTS,
	// Rendered inside the expanded panel of a row of the executions table: the contribution reads the row as $ctx.row.<field>.
	'execution-row-actions': FLOW_ACTION_SLOT_ACCEPTS,
};

/** Fields of an executions-table row a contribution to `execution-row-actions` can read as `$ctx.row.<field>` (whole-string expressions only). */
export const FLOW_EXECUTION_ROW_CONTEXT_FIELDS: readonly string[] = ['executionId', 'flowId'];

/** Page paths of the flow module (manifest `page` extension points), relative to its `/modules/flow` prefix. */
export const FLOW_PAGE_PATHS: readonly string[] = [
	'/executions',
	'/executions/:id',
	'/executions/:id/logs',
	'/workers',
	'/logs',
	'/plugins',
	'/plugins/:id',
];

const FLOW_PAGE_PREFIX = `/modules/${FLOW_APP_MODULE_ID}`;

/** Where the detail of one run lives. */
export function executionPagePath(executionId: string): string {
	return `${FLOW_PAGE_PREFIX}/executions/${encodeURIComponent(executionId)}`;
}

/** Where the logs of one run live (the page filters them by step, level and text). */
export function executionLogsPath(executionId: string): string {
	return `${executionPagePath(executionId)}/logs`;
}
