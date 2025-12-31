import { BrowserRouter, Route, Routes } from 'react-router-dom';

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
import { Ingredients2Page } from '@app/pages/ingredients2/Ingredients2Page';
import { Ingredients3GridPage } from '@app/pages/ingredients3/Ingredients3GridPage';
import { IngredientsPage } from '@app/pages/ingredients/IngredientsPage';
import { InterventionDetailPage } from '@app/pages/interventions/InterventionDetailPage';
import { InterventionsPage } from '@app/pages/interventions/InterventionsPage';
import { TasksPage2 } from '@app/pages/tasks2/TasksPage2';
import { TaskDetailSplitPage } from '@app/pages/tasks/TaskDetailSplitPage';
import { TaskDetailStackedPage } from '@app/pages/tasks/TaskDetailStackedPage';
import { TasksPage } from '@app/pages/tasks/TasksPage';
import { WorkersPage2 } from '@app/pages/workers2/WorkersPage2';
import { WorkersPage } from '@app/pages/workers/WorkersPage';
import { WorkspacesPage2 } from '@app/pages/workspaces2/WorkspacesPage2';
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
						<Route path="/workers2" element={<WorkersPage2 />} />
						<Route path="/tasks" element={<TasksPage />} />
						<Route path="/tasks2" element={<TasksPage2 />} />
						<Route path="/tasks/:id/logs-split" element={<TaskDetailSplitPage />} />
						<Route path="/tasks/:id/logs-stacked" element={<TaskDetailStackedPage />} />
						<Route path="/tasks/:id" element={<TaskDetailStackedPage />} />
						<Route path="/interventions" element={<InterventionsPage />} />
						<Route path="/interventions/:interventionId" element={<InterventionDetailPage />} />
						<Route path="/workspaces" element={<WorkspacesPage />} />
						<Route path="/workspaces2" element={<WorkspacesPage2 />} />
						<Route path="/ingredients" element={<IngredientsPage />} />
						<Route path="/ingredients/:mode" element={<IngredientsPage />} />
						<Route path="/ingredients/:id/:mode" element={<IngredientsPage />} />
						<Route path="/ingredients2" element={<Ingredients2Page />} />
						<Route path="/ingredients2/:mode" element={<Ingredients2Page />} />
						<Route path="/ingredients2/:id/:mode" element={<Ingredients2Page />} />
						<Route path="/ingredients3" element={<Ingredients3GridPage />} />
						<Route path="/ingredients3/:mode" element={<Ingredients3GridPage />} />
						<Route path="/ingredients3/:id/:mode" element={<Ingredients3GridPage />} />
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
	);
}
