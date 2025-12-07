import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InventoryPage } from './pages/InventoryPage';
import { Toaster } from './components/ui/Toast/Toaster';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InventoryPage />
    <Toaster />
  </StrictMode>
);
