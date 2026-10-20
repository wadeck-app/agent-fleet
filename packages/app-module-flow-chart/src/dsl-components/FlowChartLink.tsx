import { ButtonLink } from '@wadeck-app/dsl-ui';

/** Where the chart of one run lives (page of the manifest: /executions/:id under /modules/flow-chart). */
export function chartPathOfExecution(executionId: string): string {
	return `/modules/flow-chart/flows/runs/${encodeURIComponent(executionId)}`;
}

/**
 * The "See flow chart" button contributed to the flow module's execution page. The DSL cannot concatenate the
 * id into a path, hence a component. A missing id is shown, not hidden: the contributed view is wired wrongly.
 */
export function FlowChartLink({ executionId }: { executionId: unknown }) {
	if (typeof executionId !== 'string' || executionId === '') {
		return (
			<span role="alert" className="text-xs text-danger-text">
				flow-chart: no execution id reached the &quot;See flow chart&quot; button (expected executionId:
				$route.id in the view).
			</span>
		);
	}
	return <ButtonLink to={chartPathOfExecution(executionId)} label="See flow chart" variant="secondary" size="sm" />;
}
