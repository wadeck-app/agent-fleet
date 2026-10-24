import { useParams } from 'react-router-dom';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';

import { FlowExecutionDetailContent } from './components/FlowExecutionDetailContent';

/**
 * ===========================================================================================
 * FLOW EXECUTION DETAIL PAGE (read-only)
 * ===========================================================================================
 *
 * What `flow show <id>` shows: header, steps (failed steps carry their error) and the
 * pre-formatted CLI text, plus the daemon log lines of the run (filterable, a step button
 * opens them filtered on that step).
 *
 * ===========================================================================================
 */
export function FlowExecutionDetailPage() {
	const { id } = useParams<{ id: string }>();

	if (id === undefined || id === '') {
		return (
			<Page>
				<PageHeader title="Flow execution" />
				<ErrorAlert message="Execution id is missing from the URL. Open an execution from the executions list." />
			</Page>
		);
	}

	// Remount on id change so that the previous execution never shows under the new id
	return <FlowExecutionDetailContent key={id} executionId={id} />;
}
