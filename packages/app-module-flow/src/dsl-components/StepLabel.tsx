import { Badge } from '@wadeck-app/dsl-ui';

import type { Identity } from './LogStreamChoices.js';
import { stepColor, stepHue } from './LogStreamModel.js';
import { displayStepName, orderedName } from './StepNames.js';
import { StepPill } from './StepPill.js';

export interface StepLabelProps {
	identity: Identity;
	stepId: string;
	order: number | null;
	depth: number;
	attempt: number;
	attempts: number;
	/** A run event about the step: its badge is hollow (dashed outline). */
	event?: boolean;
}

/** Who a line belongs to, in the style the identity experiment chose. */
export function StepLabel({ identity, stepId, order, depth, attempt, attempts, event = false }: StepLabelProps) {
	switch (identity) {
		case 'plain':
			return (
				<span className="block truncate font-mono" title={displayStepName(stepId)}>
					{displayStepName(stepId)}
				</span>
			);
		case 'badge':
			return <StepPill stepId={stepId} order={order} event={event} />;
		case 'tree': {
			const hue = stepHue(order);
			return (
				<span
					data-depth={depth}
					className="flex min-w-0 items-center gap-1"
					style={{
						marginLeft: `${depth * 0.75}rem`,
						...(depth > 0 && hue !== null
							? { borderLeft: `2px solid ${stepColor(hue)}`, paddingLeft: '0.25rem' }
							: {}),
					}}
				>
					<StepPill stepId={stepId} order={order} event={event} />
					{attempts > 1 && attempt >= 1 ? (
						<span className="shrink-0">
							<Badge label={`try ${attempt}/${attempts}`} variant="warning" tone="subtle" size="sm" />
						</span>
					) : null}
				</span>
			);
		}
		case 'stripe':
			return (
				<span className="block truncate font-mono text-xs text-muted" title={displayStepName(stepId)}>
					{orderedName(stepId, order)}
				</span>
			);
		default:
			throw new Error(`Unknown step identity "${String(identity)}": expected plain, badge, tree or stripe.`);
	}
}
