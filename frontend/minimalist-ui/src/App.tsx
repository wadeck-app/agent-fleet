/**
 * App root component
 */

import { AppLayout } from '@/components/layout/AppLayout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage/DashboardPage';

export function App() {
  return (
    <AppLayout>
      <DashboardPage />
    </AppLayout>
  );
}
