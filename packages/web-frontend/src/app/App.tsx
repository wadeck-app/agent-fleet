import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from '@framework/components/feedback/ErrorBoundary';
import { ConnectivityProvider } from '@framework/features/connectivity/ConnectivityContext';
import { ToastProvider } from '@framework/features/toast/ToastContext';
import { useMediaQuery } from '@framework/hooks/useMediaQuery';
import { TransportProvider } from '@transport/TransportProvider';

import { API_BASE_URL } from '@app/api/config';
import { DesktopSidebar } from '@app/components/navigation/DesktopSidebar';
import { MobileSidebar } from '@app/components/navigation/MobileSidebar';
// Lego Approach 1 — Widget Isolated
import { S1Page as LegoA1S1Page } from '@app/pages/_lego/_1_widget-isolated/S1_SimpleTable/S1Page';
import { S2Page as LegoA1S2Page } from '@app/pages/_lego/_1_widget-isolated/S2_TablePagination/S2Page';
import { S3Page as LegoA1S3Page } from '@app/pages/_lego/_1_widget-isolated/S3_FullFeatured/S3Page';
import { S4Page as LegoA1S4Page } from '@app/pages/_lego/_1_widget-isolated/S4_GridPopup/S4Page';
import { S5Page as LegoA1S5Page } from '@app/pages/_lego/_1_widget-isolated/S5_Carousel/S5Page';
import { S6Page as LegoA1S6Page } from '@app/pages/_lego/_1_widget-isolated/S6_ItemDetail/S6Page';
// Lego Approach 2 — Context Provider
import { S1Page as LegoA2S1Page } from '@app/pages/_lego/_2_context-provider/S1_SimpleTable/S1Page';
import { S2Page as LegoA2S2Page } from '@app/pages/_lego/_2_context-provider/S2_TablePagination/S2Page';
import { S3Page as LegoA2S3Page } from '@app/pages/_lego/_2_context-provider/S3_FullFeatured/S3Page';
import { S4Page as LegoA2S4Page } from '@app/pages/_lego/_2_context-provider/S4_GridPopup/S4Page';
import { S5Page as LegoA2S5Page } from '@app/pages/_lego/_2_context-provider/S5_Carousel/S5Page';
import { S6Page as LegoA2S6Page } from '@app/pages/_lego/_2_context-provider/S6_ItemDetail/S6Page';
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
						{/* Lego Approach 1 — Widget Isolated */}
						<Route path="/lego/1/s1" element={<LegoA1S1Page />} />
						<Route path="/lego/1/s2" element={<LegoA1S2Page />} />
						<Route path="/lego/1/s3" element={<LegoA1S3Page />} />
						<Route path="/lego/1/s4" element={<LegoA1S4Page />} />
						<Route path="/lego/1/s5" element={<LegoA1S5Page />} />
						<Route path="/lego/1/s6" element={<LegoA1S6Page />} />
						{/* Lego Approach 2 — Context Provider */}
						<Route path="/lego/2/s1" element={<LegoA2S1Page />} />
						<Route path="/lego/2/s2" element={<LegoA2S2Page />} />
						<Route path="/lego/2/s3" element={<LegoA2S3Page />} />
						<Route path="/lego/2/s4" element={<LegoA2S4Page />} />
						<Route path="/lego/2/s5" element={<LegoA2S5Page />} />
						<Route path="/lego/2/s6" element={<LegoA2S6Page />} />
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
