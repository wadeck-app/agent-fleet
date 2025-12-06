/**
 * Card - Generic UI Component
 * Pure presentation component with zero business logic
 */

import React from 'react';
import clsx from 'clsx';
import styles from './Card.module.scss';

export interface CardProps {
  elevated?: boolean;
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({
  elevated = false,
  interactive = false,
  padding = 'md',
  children,
  className = '',
  onClick
}: CardProps) {
  return (
    <div
      className={clsx(
        styles.card,
        elevated && styles.elevated,
        interactive && styles.interactive,
        styles[`padding-${padding}`],
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
