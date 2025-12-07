/**
 * Input component - Generic reusable UI component
 * Pure presentation with zero business logic
 * Based on shadcn/ui
 */

import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends ComponentPropsWithoutRef<'input'> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, fullWidth = false, className, ...props }, ref) => {
    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={props.id}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            error && 'border-destructive focus-visible:ring-destructive',
            className
          )}
          {...props}
        />
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
