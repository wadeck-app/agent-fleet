import type { FlowExecutionDetail } from '@shared/api/flow-daemon.contract';

type FlowStep = FlowExecutionDetail['steps'][number];
type FlowStepAttempt = NonNullable<FlowStep['attemptHistory']>[number];

function formatAttemptCost(attempt: FlowStepAttempt): string | undefined {
	// Cost does not apply to a non-model step: print nothing
	if (attempt.costNotApplicable === true) {
		return undefined;
	}
	if (attempt.costUsd !== undefined) {
		return `$${attempt.costUsd.toFixed(4)}`;
	}
	// An attempt without cost is unknown, never $0
	return `cost unknown (${attempt.costUnknownReason ?? 'no reason recorded'})`;
}

function formatAttemptLine(attempt: FlowStepAttempt): string {
	const parts = [
		`#${attempt.n}`,
		attempt.origin,
		attempt.duration,
		formatAttemptCost(attempt),
		attempt.endReason,
		attempt.turns === undefined ? undefined : `${attempt.turns} turns`,
		attempt.toolCalls === undefined ? undefined : `${attempt.toolCalls} tool calls`,
	];
	return parts.filter(part => part !== undefined).join(' | ');
}

/** Native disclosure (no new component): the per-attempt breakdown behind the step total. */
export function StepAttemptHistory({ attempts }: { attempts: FlowStepAttempt[] }) {
	return (
		<details className="text-xs">
			<summary className="cursor-pointer text-muted-foreground">{attempts.length} attempts</summary>
			<ol className="mt-1 flex flex-col gap-0.5">
				{attempts.map(attempt => (
					<li key={attempt.n} className="whitespace-nowrap">
						{formatAttemptLine(attempt)}
					</li>
				))}
			</ol>
		</details>
	);
}
