import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from '@framework/components/feedback/ErrorBoundary';
import { ConnectivityProvider } from '@framework/features/connectivity/ConnectivityContext';
import { ToastProvider } from '@framework/features/toast/ToastContext';
import { useMediaQuery } from '@framework/hooks/useMediaQuery';
import { TransportProvider } from '@transport/TransportProvider';

import { API_BASE_URL } from '@app/api/config';
import { DesktopSidebar } from '@app/components/navigation/DesktopSidebar';
import { MobileSidebar } from '@app/components/navigation/MobileSidebar';
// Lego Approach 1 -- Widget Isolated
import { S1Page as LegoA1S1Page } from '@app/pages/_lego/_1_widget-isolated/S1_SimpleTable/S1Page';
import { S2Page as LegoA1S2Page } from '@app/pages/_lego/_1_widget-isolated/S2_TablePagination/S2Page';
import { S3Page as LegoA1S3Page } from '@app/pages/_lego/_1_widget-isolated/S3_FullFeatured/S3Page';
import { S4Page as LegoA1S4Page } from '@app/pages/_lego/_1_widget-isolated/S4_GridPopup/S4Page';
import { S5Page as LegoA1S5Page } from '@app/pages/_lego/_1_widget-isolated/S5_Carousel/S5Page';
import { S6Page as LegoA1S6Page } from '@app/pages/_lego/_1_widget-isolated/S6_ItemDetail/S6Page';
import { S7Page as LegoA1S7Page } from '@app/pages/_lego/_1_widget-isolated/S7_MasterDetailNav/S7Page';
import { S9Page as LegoA1S9Page } from '@app/pages/_lego/_1_widget-isolated/S9_TwoIndependentTables/S9Page';
import { S10Page as LegoA1S10Page } from '@app/pages/_lego/_1_widget-isolated/S10_InlineEditing/S10Page';
import { S11Page as LegoA1S11Page } from '@app/pages/_lego/_1_widget-isolated/S11_ThreeEditModes/S11Page';
import { S2TablesPage as LegoA1S2TablesPage } from '@app/pages/_lego/_1_widget-isolated/S_2TABLES/S2TablesPage';
import { SBusPage as LegoA1SBusPage } from '@app/pages/_lego/_1_widget-isolated/S_BUS/SBusPage';
import { SEditPage as LegoA1SEditPage } from '@app/pages/_lego/_1_widget-isolated/S_EDIT/SEditPage';
import { SForkFeatPage as LegoA1SForkFeatPage } from '@app/pages/_lego/_1_widget-isolated/S_FORK_FEAT/SForkFeatPage';
import { SWsPage as LegoA1SWsPage } from '@app/pages/_lego/_1_widget-isolated/S_WS/SWsPage';
// Lego Approach 2 -- Context Provider
import { S1Page as LegoA2S1Page } from '@app/pages/_lego/_2_context-provider/S1_SimpleTable/S1Page';
import { S2Page as LegoA2S2Page } from '@app/pages/_lego/_2_context-provider/S2_TablePagination/S2Page';
import { S3Page as LegoA2S3Page } from '@app/pages/_lego/_2_context-provider/S3_FullFeatured/S3Page';
import { S4Page as LegoA2S4Page } from '@app/pages/_lego/_2_context-provider/S4_GridPopup/S4Page';
import { S5Page as LegoA2S5Page } from '@app/pages/_lego/_2_context-provider/S5_Carousel/S5Page';
import { S6Page as LegoA2S6Page } from '@app/pages/_lego/_2_context-provider/S6_ItemDetail/S6Page';
import { S7Page as LegoA2S7Page } from '@app/pages/_lego/_2_context-provider/S7_MasterDetailNav/S7Page';
import { S9Page as LegoA2S9Page } from '@app/pages/_lego/_2_context-provider/S9_TwoIndependentTables/S9Page';
import { S10Page as LegoA2S10Page } from '@app/pages/_lego/_2_context-provider/S10_InlineEditing/S10Page';
import { S11Page as LegoA2S11Page } from '@app/pages/_lego/_2_context-provider/S11_ThreeEditModes/S11Page';
import { S2TablesPage as LegoA2S2TablesPage } from '@app/pages/_lego/_2_context-provider/S_2TABLES/S2TablesPage';
import { SBusPage as LegoA2SBusPage } from '@app/pages/_lego/_2_context-provider/S_BUS/SBusPage';
import { SEditPage as LegoA2SEditPage } from '@app/pages/_lego/_2_context-provider/S_EDIT/SEditPage';
import { SForkFeatPage as LegoA2SForkFeatPage } from '@app/pages/_lego/_2_context-provider/S_FORK_FEAT/SForkFeatPage';
import { SWsPage as LegoA2SWsPage } from '@app/pages/_lego/_2_context-provider/S_WS/SWsPage';
// Lego Approach 3 -- Feature Hooks
import { S1Page as LegoA3S1Page } from '@app/pages/_lego/_3_feature-hooks/S1_SimpleTable/S1Page';
import { S2Page as LegoA3S2Page } from '@app/pages/_lego/_3_feature-hooks/S2_TablePagination/S2Page';
import { S3Page as LegoA3S3Page } from '@app/pages/_lego/_3_feature-hooks/S3_FullFeatured/S3Page';
import { S4Page as LegoA3S4Page } from '@app/pages/_lego/_3_feature-hooks/S4_GridPopup/S4Page';
import { S5Page as LegoA3S5Page } from '@app/pages/_lego/_3_feature-hooks/S5_Carousel/S5Page';
import { S6Page as LegoA3S6Page } from '@app/pages/_lego/_3_feature-hooks/S6_ItemDetail/S6Page';
import { S7Page as LegoA3S7Page } from '@app/pages/_lego/_3_feature-hooks/S7_MasterDetailNav/S7Page';
import { S9Page as LegoA3S9Page } from '@app/pages/_lego/_3_feature-hooks/S9_TwoIndependentTables/S9Page';
import { S10Page as LegoA3S10Page } from '@app/pages/_lego/_3_feature-hooks/S10_InlineEditing/S10Page';
import { S11Page as LegoA3S11Page } from '@app/pages/_lego/_3_feature-hooks/S11_ThreeEditModes/S11Page';
import { S2TablesPage as LegoA3S2TablesPage } from '@app/pages/_lego/_3_feature-hooks/S_2TABLES/S2TablesPage';
import { SBusPage as LegoA3SBusPage } from '@app/pages/_lego/_3_feature-hooks/S_BUS/SBusPage';
import { SEditPage as LegoA3SEditPage } from '@app/pages/_lego/_3_feature-hooks/S_EDIT/SEditPage';
import { SForkFeatPage as LegoA3SForkFeatPage } from '@app/pages/_lego/_3_feature-hooks/S_FORK_FEAT/SForkFeatPage';
import { SWsPage as LegoA3SWsPage } from '@app/pages/_lego/_3_feature-hooks/S_WS/SWsPage';
// Lego Approach 4 -- Context Children
import { S1Page as LegoA4S1Page } from '@app/pages/_lego/_4_context-children/S1_SimpleTable/S1Page';
import { S2Page as LegoA4S2Page } from '@app/pages/_lego/_4_context-children/S2_TablePagination/S2Page';
import { S3Page as LegoA4S3Page } from '@app/pages/_lego/_4_context-children/S3_FullFeatured/S3Page';
import { S4Page as LegoA4S4Page } from '@app/pages/_lego/_4_context-children/S4_GridPopup/S4Page';
import { S5Page as LegoA4S5Page } from '@app/pages/_lego/_4_context-children/S5_Carousel/S5Page';
import { S6Page as LegoA4S6Page } from '@app/pages/_lego/_4_context-children/S6_ItemDetail/S6Page';
import { S7Page as LegoA4S7Page } from '@app/pages/_lego/_4_context-children/S7_MasterDetailNav/S7Page';
import { S9Page as LegoA4S9Page } from '@app/pages/_lego/_4_context-children/S9_TwoIndependentTables/S9Page';
import { S10Page as LegoA4S10Page } from '@app/pages/_lego/_4_context-children/S10_InlineEditing/S10Page';
import { S11Page as LegoA4S11Page } from '@app/pages/_lego/_4_context-children/S11_ThreeEditModes/S11Page';
import { S2TablesPage as LegoA4S2TablesPage } from '@app/pages/_lego/_4_context-children/S_2TABLES/S2TablesPage';
import { SBusPage as LegoA4SBusPage } from '@app/pages/_lego/_4_context-children/S_BUS/SBusPage';
import { SEditPage as LegoA4SEditPage } from '@app/pages/_lego/_4_context-children/S_EDIT/SEditPage';
import { SForkFeatPage as LegoA4SForkFeatPage } from '@app/pages/_lego/_4_context-children/S_FORK_FEAT/SForkFeatPage';
import { SWsPage as LegoA4SWsPage } from '@app/pages/_lego/_4_context-children/S_WS/SWsPage';
// Lego Approach 5 -- Query Pipeline
import { S1Page as LegoA5S1Page } from '@app/pages/_lego/_5_query-pipeline/S1_SimpleTable/S1Page';
import { S2Page as LegoA5S2Page } from '@app/pages/_lego/_5_query-pipeline/S2_TablePagination/S2Page';
import { S3Page as LegoA5S3Page } from '@app/pages/_lego/_5_query-pipeline/S3_FullFeatured/S3Page';
import { S4Page as LegoA5S4Page } from '@app/pages/_lego/_5_query-pipeline/S4_GridPopup/S4Page';
import { S5Page as LegoA5S5Page } from '@app/pages/_lego/_5_query-pipeline/S5_Carousel/S5Page';
import { S6Page as LegoA5S6Page } from '@app/pages/_lego/_5_query-pipeline/S6_ItemDetail/S6Page';
import { S7Page as LegoA5S7Page } from '@app/pages/_lego/_5_query-pipeline/S7_MasterDetailNav/S7Page';
import { S9Page as LegoA5S9Page } from '@app/pages/_lego/_5_query-pipeline/S9_TwoIndependentTables/S9Page';
import { S10Page as LegoA5S10Page } from '@app/pages/_lego/_5_query-pipeline/S10_InlineEditing/S10Page';
import { S11Page as LegoA5S11Page } from '@app/pages/_lego/_5_query-pipeline/S11_ThreeEditModes/S11Page';
import { S2TablesPage as LegoA5S2TablesPage } from '@app/pages/_lego/_5_query-pipeline/S_2TABLES/S2TablesPage';
import { SBusPage as LegoA5SBusPage } from '@app/pages/_lego/_5_query-pipeline/S_BUS/SBusPage';
import { SEditPage as LegoA5SEditPage } from '@app/pages/_lego/_5_query-pipeline/S_EDIT/SEditPage';
import { SForkFeatPage as LegoA5SForkFeatPage } from '@app/pages/_lego/_5_query-pipeline/S_FORK_FEAT/SForkFeatPage';
import { SWsPage as LegoA5SWsPage } from '@app/pages/_lego/_5_query-pipeline/S_WS/SWsPage';
// Lego Approach 6 -- Data2-Based
import { S1Page as LegoA6S1Page } from '@app/pages/_lego/_6_data2-based/S1_SimpleTable/S1Page';
import { S2Page as LegoA6S2Page } from '@app/pages/_lego/_6_data2-based/S2_TablePagination/S2Page';
import { S3Page as LegoA6S3Page } from '@app/pages/_lego/_6_data2-based/S3_FullFeatured/S3Page';
import { S4Page as LegoA6S4Page } from '@app/pages/_lego/_6_data2-based/S4_GridPopup/S4Page';
import { S5Page as LegoA6S5Page } from '@app/pages/_lego/_6_data2-based/S5_Carousel/S5Page';
import { S6Page as LegoA6S6Page } from '@app/pages/_lego/_6_data2-based/S6_ItemDetail/S6Page';
import { S7Page as LegoA6S7Page } from '@app/pages/_lego/_6_data2-based/S7_MasterDetailNav/S7Page';
import { S9Page as LegoA6S9Page } from '@app/pages/_lego/_6_data2-based/S9_TwoIndependentTables/S9Page';
import { S10Page as LegoA6S10Page } from '@app/pages/_lego/_6_data2-based/S10_InlineEditing/S10Page';
import { S11Page as LegoA6S11Page } from '@app/pages/_lego/_6_data2-based/S11_ThreeEditModes/S11Page';
import { S2TablesPage as LegoA6S2TablesPage } from '@app/pages/_lego/_6_data2-based/S_2TABLES/S2TablesPage';
import { SBusPage as LegoA6SBusPage } from '@app/pages/_lego/_6_data2-based/S_BUS/SBusPage';
import { SEditPage as LegoA6SEditPage } from '@app/pages/_lego/_6_data2-based/S_EDIT/SEditPage';
import { SForkFeatPage as LegoA6SForkFeatPage } from '@app/pages/_lego/_6_data2-based/S_FORK_FEAT/SForkFeatPage';
import { SWsPage as LegoA6SWsPage } from '@app/pages/_lego/_6_data2-based/S_WS/SWsPage';
import { LoginPage } from '@app/pages/auth/LoginPage';
import { ProtectedRoute } from '@app/pages/auth/ProtectedRoute';
import { BooksPage } from '@app/pages/books/BooksPage';
import { DashboardPage } from '@app/pages/dashboard/DashboardPage';
import { FlowEditorPage } from '@app/pages/flows/flow-editor/FlowEditorPage';
import { Ingredients2TablePage } from '@app/pages/ingredients2/Ingredients2TablePage';
import { Ingredients3GridPage } from '@app/pages/ingredients3/Ingredients3GridPage';
import { Ingredients4CarouselPage as Ingredients4cCarouselPage } from '@app/pages/ingredients4c/Ingredients4CarouselPage';
import { IngredientsV5Page } from '@app/pages/ingredients5/IngredientsV5Page';
import { InterventionDetailPage } from '@app/pages/interventions/InterventionDetailPage';
import { InterventionsV2Page } from '@app/pages/interventions/InterventionsV2Page';
import { ProjectsV2Page } from '@app/pages/projects2/ProjectsV2Page';
import { ProjectBoardPage } from '@app/pages/projects/ProjectBoardPage';
import { ProjectsPage } from '@app/pages/projects/ProjectsPage';
import { TaskDetailSplitPage } from '@app/pages/tasks/TaskDetailSplitPage';
import { TaskDetailStackedPage } from '@app/pages/tasks/TaskDetailStackedPage';
import { TasksPage } from '@app/pages/tasks/TasksPage';
import { TicketDetailPage } from '@app/pages/tickets/TicketDetailPage';
import { TicketsPage } from '@app/pages/tickets/TicketsPage';
import { WorkerDetailSplitPage } from '@app/pages/workers/WorkerDetailSplitPage';
import { WorkerDetailStackedPage } from '@app/pages/workers/WorkerDetailStackedPage';
import { WorkersPage } from '@app/pages/workers/WorkersPage';
import { WorkspacesPage } from '@app/pages/workspaces/WorkspacesPage';

import { circuitBreakerService } from './services';

function Layout() {
	const isMobile = useMediaQuery('(max-width: 768px)');

	return (
		<div className="min-h-screen bg-background">
			{/* Desktop: Fixed Sidebar */}
			{!isMobile && <DesktopSidebar />}

			{/* Mobile: Hamburger + Sheet */}
			{isMobile && <MobileSidebar />}

			{/* Main Content */}
			<main
				className={`
      min-h-screen overflow-auto
      ${!isMobile ? 'ml-64' : ''}
    `}
			>
				<ProtectedRoute>
					<Routes>
						<Route path="/dashboard" element={<DashboardPage />} />
						<Route path="/workers" element={<WorkersPage />} />
						<Route path="/workers/:workerId" element={<WorkerDetailSplitPage />} />
						<Route path="/workers/:workerId/split" element={<WorkerDetailSplitPage />} />
						<Route path="/workers/:workerId/stacked" element={<WorkerDetailStackedPage />} />
						<Route path="/tasks" element={<TasksPage />} />
						<Route path="/tasks/:id/logs-split" element={<TaskDetailSplitPage />} />
						<Route path="/tasks/:id/logs-stacked" element={<TaskDetailStackedPage />} />
						<Route path="/tasks/:id" element={<TaskDetailStackedPage />} />
						<Route path="/tickets" element={<TicketsPage />} />
						<Route path="/tickets/:id" element={<TicketDetailPage />} />
						<Route path="/projects" element={<ProjectsPage />} />
						<Route path="/projects-v2" element={<ProjectsV2Page />} />
						<Route path="/projects/:projectId/board" element={<ProjectBoardPage />} />
						<Route path="/interventions-v2" element={<InterventionsV2Page />} />
						<Route path="/interventions/:interventionId" element={<InterventionDetailPage />} />
						<Route path="/workspaces" element={<WorkspacesPage />} />
						<Route path="/ingredients2" element={<Ingredients2TablePage />} />
						<Route path="/ingredients2/:mode" element={<Ingredients2TablePage />} />
						<Route path="/ingredients2/:id/:mode" element={<Ingredients2TablePage />} />
						<Route path="/ingredients3" element={<Ingredients3GridPage />} />
						<Route path="/ingredients3/:mode" element={<Ingredients3GridPage />} />
						<Route path="/ingredients3/:id/:mode" element={<Ingredients3GridPage />} />
						<Route path="/ingredients4c" element={<Ingredients4cCarouselPage />} />
						<Route path="/ingredients4c/:mode" element={<Ingredients4cCarouselPage />} />
						<Route path="/ingredients4c/:id/:mode" element={<Ingredients4cCarouselPage />} />
						<Route path="/ingredients5" element={<IngredientsV5Page />} />
						<Route path="/ingredients5/:mode" element={<IngredientsV5Page />} />
						<Route path="/ingredients5/:id/:mode" element={<IngredientsV5Page />} />
						<Route path="/books" element={<BooksPage />} />
						<Route path="/books/:mode" element={<BooksPage />} />
						<Route path="/books/:id/:mode" element={<BooksPage />} />
						<Route path="/flows/new" element={<FlowEditorPage />} />
						<Route path="/flows/:flowId/edit" element={<FlowEditorPage />} />
						{/* Lego Approach 1 -- Widget Isolated */}
						<Route path="/lego/1/s1" element={<LegoA1S1Page />} />
						<Route path="/lego/1/s2" element={<LegoA1S2Page />} />
						<Route path="/lego/1/s3" element={<LegoA1S3Page />} />
						<Route path="/lego/1/s4" element={<LegoA1S4Page />} />
						<Route path="/lego/1/s5" element={<LegoA1S5Page />} />
						<Route path="/lego/1/s6" element={<LegoA1S6Page />} />
						<Route path="/lego/1/s7" element={<LegoA1S7Page />} />
						<Route path="/lego/1/s9" element={<LegoA1S9Page />} />
						<Route path="/lego/1/s10" element={<LegoA1S10Page />} />
						<Route path="/lego/1/s11" element={<LegoA1S11Page />} />
						<Route path="/lego/1/s_bus" element={<LegoA1SBusPage />} />
						<Route path="/lego/1/s_2tables" element={<LegoA1S2TablesPage />} />
						<Route path="/lego/1/s_edit" element={<LegoA1SEditPage />} />
						<Route path="/lego/1/s_fork_feat" element={<LegoA1SForkFeatPage />} />
						<Route path="/lego/1/s_ws" element={<LegoA1SWsPage />} />
						{/* Lego Approach 2 -- Context Provider */}
						<Route path="/lego/2/s1" element={<LegoA2S1Page />} />
						<Route path="/lego/2/s2" element={<LegoA2S2Page />} />
						<Route path="/lego/2/s3" element={<LegoA2S3Page />} />
						<Route path="/lego/2/s4" element={<LegoA2S4Page />} />
						<Route path="/lego/2/s5" element={<LegoA2S5Page />} />
						<Route path="/lego/2/s6" element={<LegoA2S6Page />} />
						<Route path="/lego/2/s7" element={<LegoA2S7Page />} />
						<Route path="/lego/2/s9" element={<LegoA2S9Page />} />
						<Route path="/lego/2/s10" element={<LegoA2S10Page />} />
						<Route path="/lego/2/s11" element={<LegoA2S11Page />} />
						<Route path="/lego/2/s_bus" element={<LegoA2SBusPage />} />
						<Route path="/lego/2/s_2tables" element={<LegoA2S2TablesPage />} />
						<Route path="/lego/2/s_edit" element={<LegoA2SEditPage />} />
						<Route path="/lego/2/s_fork_feat" element={<LegoA2SForkFeatPage />} />
						<Route path="/lego/2/s_ws" element={<LegoA2SWsPage />} />
						{/* Lego Approach 3 -- Feature Hooks */}
						<Route path="/lego/3/s1" element={<LegoA3S1Page />} />
						<Route path="/lego/3/s2" element={<LegoA3S2Page />} />
						<Route path="/lego/3/s3" element={<LegoA3S3Page />} />
						<Route path="/lego/3/s4" element={<LegoA3S4Page />} />
						<Route path="/lego/3/s5" element={<LegoA3S5Page />} />
						<Route path="/lego/3/s6" element={<LegoA3S6Page />} />
						<Route path="/lego/3/s7" element={<LegoA3S7Page />} />
						<Route path="/lego/3/s9" element={<LegoA3S9Page />} />
						<Route path="/lego/3/s10" element={<LegoA3S10Page />} />
						<Route path="/lego/3/s11" element={<LegoA3S11Page />} />
						<Route path="/lego/3/s_bus" element={<LegoA3SBusPage />} />
						<Route path="/lego/3/s_2tables" element={<LegoA3S2TablesPage />} />
						<Route path="/lego/3/s_edit" element={<LegoA3SEditPage />} />
						<Route path="/lego/3/s_fork_feat" element={<LegoA3SForkFeatPage />} />
						<Route path="/lego/3/s_ws" element={<LegoA3SWsPage />} />
						{/* Lego Approach 4 -- Context Children */}
						<Route path="/lego/4/s1" element={<LegoA4S1Page />} />
						<Route path="/lego/4/s2" element={<LegoA4S2Page />} />
						<Route path="/lego/4/s3" element={<LegoA4S3Page />} />
						<Route path="/lego/4/s4" element={<LegoA4S4Page />} />
						<Route path="/lego/4/s5" element={<LegoA4S5Page />} />
						<Route path="/lego/4/s6" element={<LegoA4S6Page />} />
						<Route path="/lego/4/s7" element={<LegoA4S7Page />} />
						<Route path="/lego/4/s9" element={<LegoA4S9Page />} />
						<Route path="/lego/4/s10" element={<LegoA4S10Page />} />
						<Route path="/lego/4/s11" element={<LegoA4S11Page />} />
						<Route path="/lego/4/s_bus" element={<LegoA4SBusPage />} />
						<Route path="/lego/4/s_2tables" element={<LegoA4S2TablesPage />} />
						<Route path="/lego/4/s_edit" element={<LegoA4SEditPage />} />
						<Route path="/lego/4/s_fork_feat" element={<LegoA4SForkFeatPage />} />
						<Route path="/lego/4/s_ws" element={<LegoA4SWsPage />} />
						{/* Lego Approach 5 -- Query Pipeline */}
						<Route path="/lego/5/s1" element={<LegoA5S1Page />} />
						<Route path="/lego/5/s2" element={<LegoA5S2Page />} />
						<Route path="/lego/5/s3" element={<LegoA5S3Page />} />
						<Route path="/lego/5/s4" element={<LegoA5S4Page />} />
						<Route path="/lego/5/s5" element={<LegoA5S5Page />} />
						<Route path="/lego/5/s6" element={<LegoA5S6Page />} />
						<Route path="/lego/5/s7" element={<LegoA5S7Page />} />
						<Route path="/lego/5/s9" element={<LegoA5S9Page />} />
						<Route path="/lego/5/s10" element={<LegoA5S10Page />} />
						<Route path="/lego/5/s11" element={<LegoA5S11Page />} />
						<Route path="/lego/5/s_bus" element={<LegoA5SBusPage />} />
						<Route path="/lego/5/s_2tables" element={<LegoA5S2TablesPage />} />
						<Route path="/lego/5/s_edit" element={<LegoA5SEditPage />} />
						<Route path="/lego/5/s_fork_feat" element={<LegoA5SForkFeatPage />} />
						<Route path="/lego/5/s_ws" element={<LegoA5SWsPage />} />
						{/* Lego Approach 6 -- Data2-Based */}
						<Route path="/lego/6/s1" element={<LegoA6S1Page />} />
						<Route path="/lego/6/s2" element={<LegoA6S2Page />} />
						<Route path="/lego/6/s3" element={<LegoA6S3Page />} />
						<Route path="/lego/6/s4" element={<LegoA6S4Page />} />
						<Route path="/lego/6/s5" element={<LegoA6S5Page />} />
						<Route path="/lego/6/s6" element={<LegoA6S6Page />} />
						<Route path="/lego/6/s7" element={<LegoA6S7Page />} />
						<Route path="/lego/6/s9" element={<LegoA6S9Page />} />
						<Route path="/lego/6/s10" element={<LegoA6S10Page />} />
						<Route path="/lego/6/s11" element={<LegoA6S11Page />} />
						<Route path="/lego/6/s_bus" element={<LegoA6SBusPage />} />
						<Route path="/lego/6/s_2tables" element={<LegoA6S2TablesPage />} />
						<Route path="/lego/6/s_edit" element={<LegoA6SEditPage />} />
						<Route path="/lego/6/s_fork_feat" element={<LegoA6SForkFeatPage />} />
						<Route path="/lego/6/s_ws" element={<LegoA6SWsPage />} />
						<Route path="/" element={<DashboardPage />} />
					</Routes>
				</ProtectedRoute>
			</main>
		</div>
	);
}

export function App() {
	// Use API_BASE_URL for TransportProvider (backend URL, not frontend URL)
	// Remove /api suffix for base URL
	const backendBaseUrl = API_BASE_URL.replace(/\/api$/, '');

	return (
		<ErrorBoundary>
			<ConnectivityProvider circuitBreakerService={circuitBreakerService}>
				<ToastProvider>
					<BrowserRouter>
						<TransportProvider baseUrl={backendBaseUrl}>
							<Routes>
								<Route path="/login" element={<LoginPage />} />
								<Route path="/*" element={<Layout />} />
							</Routes>
						</TransportProvider>
					</BrowserRouter>
				</ToastProvider>
			</ConnectivityProvider>
		</ErrorBoundary>
	);
}
