/**
 * Spinner component - Generic reusable UI component
 * Pure presentation with zero business logic
 */

import clsx from 'clsx';
import styles from './Spinner.module.scss';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div className={clsx(styles.spinner, styles[`size-${size}`], className)}>
      <div className={styles.ring} />
    </div>
  );
}
