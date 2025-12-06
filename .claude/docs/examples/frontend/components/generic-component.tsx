// @ts-nocheck - Example code, not compiled
// Generic Reusable Component Pattern
// Pure UI with zero business logic, based on Radix UI primitives

import * as React from 'react';
import * as RadixButton from '@radix-ui/react-button';
import styles from './Button.module.scss';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

/**
 * Generic Button component
 * - Zero business logic
 * - Based on Radix UI Button primitive
 * - Pure presentation
 */
export function Button({
  variant = 'primary',
  size = 'medium',
  disabled = false,
  children,
  onClick
}: ButtonProps) {
  return (
    <RadixButton.Root
      className={`${styles.button} ${styles[variant]} ${styles[size]}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </RadixButton.Root>
  );
}
