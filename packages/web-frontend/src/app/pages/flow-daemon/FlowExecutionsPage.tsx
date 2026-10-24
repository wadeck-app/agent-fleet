import { useNavigate } from 'react-router-dom';

import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';

import { FlowExecutionsFiltersBar } from './components/FlowExecutionsFiltersBar';
import { FlowExecutionsTable, getExecutionDetailPath } from './components/FlowExecutionsTable';
import { useFlowExecutions } from './hooks/useFlowExecutions';

/**
 * ===========================================================================================
 * FLOW EXECUTIONS PAGE (read-only)
 * ===========================================================================================
 *
 * What `flow history` shows: filterable, paginated list of executions. Filters and page live
 * in the URL. Row click opens the detail page.
 *
 * ===========================================================================================
 */
export function FlowExecutionsPage() {
	const navigate = useNavigate();
	const {
		filters,
		setStatus,
		setFlow,
		setPage,
		setLimit,
		executions,
		loading,
		error,
		refresh,
		flowOptions,
		flowOptionsError,
	} = useFlowExecutions();

	return (
		<Page>
			<PageHeader title="Flow executions" badge={executions?.total} onRefresh={refresh} isRefreshing={loading} />

			<FlowExecutionsFiltersBar
				status={filters.status}
				flow={filters.flow}
				flowOptions={flowOptions}
				onStatusChange={setStatus}
				onFlowChange={setFlow}
			/>

			{flowOptionsError !== null && (
				<ErrorAlert
					className="mb-4"
					message={`The flow filter list could not be loaded: ${flowOptionsError}`}
				/>
			)}
			{error !== null && <ErrorAlert className="mb-4" message={error} />}

			{error === null && (
				<FlowExecutionsTable
					items={executions?.items ?? []}
					total={executions?.total ?? 0}
					page={filters.page}
					limit={filters.limit}
					initialLoading={loading && executions === null}
					refreshing={loading && executions !== null}
					onPageChange={setPage}
					onLimitChange={setLimit}
					onOpenExecution={executionId => navigate(getExecutionDetailPath(executionId))}
				/>
			)}
		</Page>
	);
}
