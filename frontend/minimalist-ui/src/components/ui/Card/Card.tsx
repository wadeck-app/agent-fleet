/**
 * Card component - Generic reusable UI component
 * Pure presentation with zero business logic
 */

import { ComponentPropsWithoutRef } from 'react';
import clsx from 'clsx';
import styles from './Card.module.scss';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  elevated?: boolean;
  interactive?: boolean;
}

export function Card({ elevated = false, interactive = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        styles.card,
        elevated && styles.elevated,
        interactive && styles.interactive,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
