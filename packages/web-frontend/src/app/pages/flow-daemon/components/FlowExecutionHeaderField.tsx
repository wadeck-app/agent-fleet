import type { ReactNode } from 'react';

export interface FlowExecutionHeaderFieldProps {
	label: string;
	children: ReactNode;
}

/** One label/value pair of the execution header. */
export function FlowExecutionHeaderField({ label, children }: FlowExecutionHeaderFieldProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="text-sm break-all">{children}</dd>
		</div>
	);
}
