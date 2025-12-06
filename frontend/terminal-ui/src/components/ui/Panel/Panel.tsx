/**
 * Panel - Generic UI component
 * Pure presentation with zero business logic
 */

import { ReactNode } from 'react';
import styles from './Panel.module.scss';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  footer?: ReactNode;
}

export function Panel({ title, children, className = '', actions, footer }: PanelProps) {
  return (
    <div className={`${styles.panel} ${className}`}>
      {title && (
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>{title}</h2>
          {actions && <div className={styles.panelActions}>{actions}</div>}
        </div>
      )}
      <div className={styles.panelContent}>{children}</div>
      {footer && <div className={styles.panelFooter}>{footer}</div>}
    </div>
  );
}
