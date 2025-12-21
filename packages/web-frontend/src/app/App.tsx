import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ConnectivityProvider } from '@framework/features/connectivity/ConnectivityContext';
import { ToastProvider } from '@framework/features/toast/ToastContext';
import { useMediaQuery } from '@framework/hooks/useMediaQuery';

import { DesktopSidebar } from '@app/components/navigation/DesktopSidebar';
import { MobileSidebar } from '@app/components/navigation/MobileSidebar';
import { BooksPage } from '@app/pages/books/BooksPage';
import { DashboardPage } from '@app/pages/dashboard/DashboardPage';
import { IngredientsPage } from '@app/pages/ingredients/IngredientsPage';
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
				<div className="container mx-auto max-w-7xl p-6">
					<Routes>
						<Route path="/dashboard" element={<DashboardPage />} />
						<Route path="/workers" element={<WorkersPage />} />
						<Route path="/tasks" element={<TasksPage />} />
						<Route path="/workspaces" element={<WorkspacesPage />} />
						<Route path="/ingredients" element={<IngredientsPage />} />
						<Route path="/ingredients/:mode" element={<IngredientsPage />} />
						<Route path="/ingredients/:id/:mode" element={<IngredientsPage />} />
						<Route path="/books" element={<BooksPage />} />
						<Route path="/books/:mode" element={<BooksPage />} />
						<Route path="/books/:id/:mode" element={<BooksPage />} />
						<Route path="/" element={<DashboardPage />} />
					</Routes>
				</div>
			</main>
		</div>
	);
}

export function App() {
	return (
		<ConnectivityProvider circuitBreakerService={circuitBreakerService}>
			<ToastProvider>
				<BrowserRouter>
					<Layout />
				</BrowserRouter>
			</ToastProvider>
		</ConnectivityProvider>
	);
}
