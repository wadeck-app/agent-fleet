/**
 * Input component - Generic reusable UI component
 * Pure presentation with zero business logic
 * Based on shadcn/ui with Radix UI Label
 */

import { ComponentPropsWithoutRef, forwardRef } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import styles from './Input.module.scss';

const inputVariants = cva(styles.input, {
  variants: {
    error: {
      true: styles.error,
    },
  },
});

export interface InputProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'error'> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = false, className, ...props }, ref) => {
    const inputId = props.id || `input-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className={cn(styles.wrapper, fullWidth && styles.fullWidth)}>
        {label && (
          <LabelPrimitive.Root htmlFor={inputId} className={styles.label}>
            {label}
          </LabelPrimitive.Root>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(inputVariants({ error: !!error, className }))}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <span id={`${inputId}-error`} className={styles.errorMessage} role="alert">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
