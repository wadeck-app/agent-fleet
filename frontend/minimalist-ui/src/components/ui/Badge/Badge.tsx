/**
 * Badge component - Generic reusable UI component
 * Pure presentation with zero business logic
 */

import { ComponentPropsWithoutRef } from 'react';
import clsx from 'clsx';
import styles from './Badge.module.scss';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps extends ComponentPropsWithoutRef<'span'> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ variant = 'default', dot = false, className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        styles.badge,
        styles[`variant-${variant}`],
        dot && styles.withDot,
        className
      )}
      {...props}
    >
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
