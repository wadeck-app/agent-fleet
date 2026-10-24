import { stepColor, stepHue } from './LogStreamModel.js';
import { orderedName } from './StepNames.js';

// A step has a hue from its execution order; the tint keeps the text readable in the light and the dark theme.
const PILL_CLASS = 'inline-block max-w-full truncate rounded border px-1.5 align-middle font-mono text-xs leading-5';
const NEUTRAL_PILL_CLASS = `${PILL_CLASS} border-border bg-muted-bg text-muted`;

/** The coloured badge of a step: order and name. */
export function StepPill({ stepId, order, event = false }: { stepId: string; order: number | null; event?: boolean }) {
	const hue = stepHue(order);
	const text = orderedName(stepId, order);
	if (hue === null) {
		return (
			<span className={NEUTRAL_PILL_CLASS} title={text}>
				{text}
			</span>
		);
	}
	return (
		<span
			className={PILL_CLASS}
			data-event={event ? 'true' : undefined}
			style={
				event
					? { borderStyle: 'dashed', borderColor: stepColor(hue) }
					: { backgroundColor: stepColor(hue, 0.18), borderColor: stepColor(hue) }
			}
			title={event ? `Run event about ${text}` : text}
		>
			{text}
		</span>
	);
}
