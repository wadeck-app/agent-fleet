/**
 * Spinner component - Generic reusable UI component
 * Pure presentation with zero business logic
 * Based on shadcn/ui patterns
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-3',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <motion.div
      className={cn('flex items-center justify-center', className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={cn(
          'animate-spin rounded-full border-primary border-t-transparent',
          sizeClasses[size]
        )}
      />
    </motion.div>
  );
}
