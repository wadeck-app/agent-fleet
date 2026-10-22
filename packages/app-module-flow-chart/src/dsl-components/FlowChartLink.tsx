import { ButtonLink } from '@wadeck-app/dsl-ui';
import { chartPathOfExecution } from 'flow-core/graph-tree';

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
