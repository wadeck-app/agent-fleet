import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MainLayout } from './layouts/MainLayout';
import { InventoryPage } from './pages/InventoryPage';
import { ToastProvider } from './contexts/ToastContext';
import './styles/theme.scss';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <ToastProvider>
      <MainLayout>
        <InventoryPage />
      </MainLayout>
    </ToastProvider>
  </StrictMode>
);
