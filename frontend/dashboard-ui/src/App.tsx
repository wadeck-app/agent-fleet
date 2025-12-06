import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout/DashboardLayout';
import { DashboardPage } from '@/pages/DashboardPage/DashboardPage';

function App() {
  return (
    <DashboardLayout>
      <DashboardPage />
    </DashboardLayout>
  );
}

export default App;
