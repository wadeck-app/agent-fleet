/**
 * Badge component - Generic reusable UI component
 * Pure presentation with zero business logic
 * Based on shadcn/ui with Framer Motion animations
 */

import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
        outline: 'text-foreground',
        success: 'border-transparent bg-green-500 text-white shadow hover:bg-green-500/80',
        warning: 'border-transparent bg-yellow-500 text-white shadow hover:bg-yellow-500/80',
        error: 'border-transparent bg-red-500 text-white shadow hover:bg-red-500/80',
        info: 'border-transparent bg-blue-500 text-white shadow hover:bg-blue-500/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps extends ComponentPropsWithoutRef<'div'>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

const MotionDiv = motion.div;

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, dot = false, children, ...props }, ref) => {
    return (
      <MotionDiv
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.2 }}
        {...(props as any)}
      >
        {dot && (
          <motion.span
            className="mr-1 h-1.5 w-1.5 rounded-full bg-current"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          />
        )}
        {children}
      </MotionDiv>
    );
  }
);

Badge.displayName = 'Badge';
