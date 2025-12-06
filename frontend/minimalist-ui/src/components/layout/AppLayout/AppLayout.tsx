/**
 * AppLayout - Main layout component
 * Handles structural positioning and composition
 */

import { ReactNode } from 'react';
import styles from './AppLayout.module.scss';

export interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.logo}>Agent Fleet</h1>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
