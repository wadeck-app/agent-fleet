import { ReactNode, useState } from 'react';
import { Button } from '../components/ui/Button';
import styles from './MainLayout.module.scss';

export interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Inventory Management</h1>
          <Button variant="secondary" size="sm" onClick={toggleTheme}>
            {theme === 'light' ? '🌙' : '☀️'}
          </Button>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
};
