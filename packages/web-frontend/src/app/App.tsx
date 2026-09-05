import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ErrorBoundary } from '@framework/components/feedback/ErrorBoundary';
import { ConnectivityProvider } from '@framework/features/connectivity/ConnectivityContext';
import { ToastProvider } from '@framework/features/toast/ToastContext';
import { TransportProvider } from '@transport/TransportProvider';

import { API_BASE_URL } from '@app/api/config';
import { LoginPage } from '@app/pages/auth/LoginPage';

import { Layout } from './Layout';
import { circuitBreakerService } from './services';

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
