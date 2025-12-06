/**
 * Input component - Generic reusable UI component
 * Pure presentation with zero business logic
 */

import { ComponentPropsWithoutRef, forwardRef } from 'react';
import clsx from 'clsx';
import styles from './Input.module.scss';

export interface InputProps extends ComponentPropsWithoutRef<'input'> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = false, className = '', ...props }, ref) => {
    return (
      <div className={clsx(styles.wrapper, fullWidth && styles.fullWidth)}>
        {label && (
          <label htmlFor={props.id} className={styles.label}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={clsx(styles.input, error && styles.error, className)}
          {...props}
        />
        {error && <span className={styles.errorMessage}>{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
