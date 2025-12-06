// @ts-nocheck - Example code, not compiled
// Layout Component Pattern
// Handles structural positioning and responsive behavior

import * as React from 'react';
import styles from './MainLayout.module.scss';

interface MainLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

/**
 * Layout component
 * - Handles structural positioning
 * - Manages responsive behavior
 * - Used within page components
 */
export function MainLayout({ children, sidebar }: MainLayoutProps) {
  return (
    <div className={styles.container}>
      {sidebar && (
        <aside className={styles.sidebar}>
          {sidebar}
        </aside>
      )}
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
