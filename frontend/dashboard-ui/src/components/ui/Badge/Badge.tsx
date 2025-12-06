/**
 * Badge - Generic UI Component
 * Pure presentation component with zero business logic
 */

import React from 'react';
import clsx from 'clsx';
import styles from './Badge.module.scss';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  className = '',
  style
}: BadgeProps) {
  return (
    <span
      className={clsx(
        styles.badge,
        styles[variant],
        styles[size],
        dot && styles.withDot,
        className
      )}
      style={style}
    >
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
