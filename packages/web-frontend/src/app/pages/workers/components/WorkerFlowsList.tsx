import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { Badge } from '@framework/components/primitives/Badge';

import { useWorkerFlows } from '../hooks/useWorkerFlows';

interface WorkerFlowsListProps {
	workerId: string;
}

/**
 * Displays the list of flows registered for a worker
 */
export function WorkerFlowsList({ workerId }: WorkerFlowsListProps) {
	const { flows, isLoading, isError, error } = useWorkerFlows(workerId);

	if (isLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<LoadingSpinner />
			</div>
		);
	}

	if (isError) {
		return <ErrorAlert message={error?.message || 'Failed to load flows'} />;
	}

	if (!flows || flows.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center text-muted-foreground">
				No flows registered for this worker.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{flows.map(flow => (
				<div key={flow.id} className="rounded-lg border border-border bg-card p-4">
					<div className="mb-2 flex items-start justify-between">
						<div>
							<h3 className="text-lg font-semibold">{flow.name}</h3>
							<p className="font-mono text-xs text-muted-foreground">
								{flow.id} v{flow.version}
							</p>
						</div>
						<Badge variant={flow.isValid ? 'success' : 'destructive'} className="font-medium">
							{flow.isValid ? 'Valid' : 'Invalid'}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground">{flow.description}</p>

					{/* Validation Errors */}
					{flow.validationErrors && flow.validationErrors.length > 0 && (
						<div className="mt-3">
							<h4 className="mb-1 text-xs font-semibold text-destructive">Validation Errors:</h4>
							<ul className="list-inside list-disc space-y-1">
								{flow.validationErrors.map((err, idx) => (
									<li key={idx} className="text-xs text-destructive">
										{String(err)}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Validation Warnings */}
					{flow.validationWarnings && flow.validationWarnings.length > 0 && (
						<div className="mt-3">
							<h4 className="mb-1 text-xs font-semibold text-warning">Validation Warnings:</h4>
							<ul className="list-inside list-disc space-y-1">
								{flow.validationWarnings.map((warn, idx) => (
									<li key={idx} className="text-xs text-muted-foreground">
										{warn.message}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			))}
		</div>
	);
}
