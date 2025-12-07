/**
 * Badge - Generic UI Component
 * Pure presentation component with zero business logic
 * Based on shadcn/ui
 */

import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import styles from './Badge.module.scss';

const badgeVariants = cva(styles.badge, {
  variants: {
    variant: {
      default: styles['variant-default'],
      success: styles['variant-success'],
      warning: styles['variant-warning'],
      error: styles['variant-error'],
      info: styles['variant-info'],
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface BadgeProps
  extends ComponentPropsWithoutRef<'span'>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant, dot = false, className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, className }))}
        {...props}
      >
        {dot && <span className={styles.dot} />}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
