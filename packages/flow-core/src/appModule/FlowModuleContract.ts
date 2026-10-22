// What the flow module offers to the modules that extend or link to it. Single source: the flow module's manifest
// test asserts its manifest.json against it, and the modules that fill its slots or link to its pages (flow-chart)
// assert their manifests and views against it, so neither reads the other's files.
import { FLOW_APP_MODULE_ID } from './AppModuleIds.js';

/** Root `$type`s accepted by both slots: button-like components, never a page-sized one. */
const ACTION_ROOT_TYPES = ['ActionBar', 'HorizontalStack', 'ButtonLink', 'ButtonAction', 'IconButton', 'Link'] as const;

/** Extension slots the flow module exposes (manifest `expose.slots`): slot name, without the `flow:` prefix a contributor writes -> root `$type`s it accepts. */
export const FLOW_EXPOSED_SLOTS: Readonly<Record<string, readonly string[]>> = {
	'execution-actions': ACTION_ROOT_TYPES,
	'executions-actions': ACTION_ROOT_TYPES,
	// Rendered inside the expanded panel of a row of the executions table: the contribution reads the row as $ctx.row.<field>.
	'execution-row-actions': ACTION_ROOT_TYPES,
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
