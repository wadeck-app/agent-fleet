import { IconButton } from '@wadeck-app/dsl-ui';

import { ChevronIcon } from './ChevronIcon.js';
import type { StepTreeData } from './ToFlowElements.js';

// xyflow would start a pan or select the step on a click that lands on the control.
const TOGGLE_CLASS = 'nodrag nopan';

/** "3 sub-steps" on a parent, with the chevron that folds them when the chart allows it. */
export function SubStepToggle({
	label,
	tree,
	onToggle,
}: {
	label: string;
	tree: StepTreeData;
	onToggle: (() => void) | undefined;
}) {
	const count = `${tree.childCount} sub-step${tree.childCount === 1 ? '' : 's'}`;
	return (
		<span className="flex shrink-0 items-center gap-1 text-muted">
			{tree.toggleable && onToggle !== undefined && (
				<IconButton
					icon={<ChevronIcon open={!tree.collapsed} />}
					aria-label={`${tree.collapsed ? 'Expand' : 'Collapse'} ${count} of ${label}`}
					aria-expanded={!tree.collapsed}
					size="icon-xs"
					className={TOGGLE_CLASS}
					onClick={event => {
						event.stopPropagation();
						onToggle();
					}}
				/>
			)}
			{count}
		</span>
	);
}
