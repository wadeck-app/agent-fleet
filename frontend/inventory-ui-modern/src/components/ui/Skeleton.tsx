/**
 * Skeleton - Generic loading placeholder component
 * Following FRONTEND_WOW.md: Pure UI component, zero business logic, based on ShadcnUI pattern
 */

import { cn } from '@/lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Skeleton component for loading states
 * Displays an animated placeholder while content is loading
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
