import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from '@framework/components/feedback/ErrorBoundary';
import { ConnectivityProvider } from '@framework/features/connectivity/ConnectivityContext';
import { ToastProvider } from '@framework/features/toast/ToastContext';
import { useMediaQuery } from '@framework/hooks/useMediaQuery';
import { TransportProvider } from '@transport/TransportProvider';

import { API_BASE_URL } from '@app/api/config';
import { DesktopSidebar } from '@app/components/navigation/DesktopSidebar';
import { MobileSidebar } from '@app/components/navigation/MobileSidebar';
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
import { InterventionsPage } from '@app/pages/interventions/InterventionsPage';
import { InterventionsV2Page } from '@app/pages/interventions/InterventionsV2Page';
import { ProjectsV2Page } from '@app/pages/projects2/ProjectsV2Page';
import { ProjectBoardPage } from '@app/pages/projects/ProjectBoardPage';
import { ProjectsPage } from '@app/pages/projects/ProjectsPage';
import { TaskDetailSplitPage } from '@app/pages/tasks/TaskDetailSplitPage';
import { TaskDetailStackedPage } from '@app/pages/tasks/TaskDetailStackedPage';
import { TasksPage } from '@app/pages/tasks/TasksPage';
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
						<Route path="/projects" element={<ProjectsPage />} />
						<Route path="/projects-v2" element={<ProjectsV2Page />} />
						<Route path="/projects/:projectId/board" element={<ProjectBoardPage />} />
						<Route path="/interventions" element={<InterventionsPage />} />
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
