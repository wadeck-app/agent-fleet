/**
 * Card component - Generic reusable UI component
 * Pure presentation with zero business logic
 * Based on shadcn/ui with Framer Motion animations
 */

import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface CardProps extends ComponentPropsWithoutRef<'div'> {
  elevated?: boolean;
  interactive?: boolean;
}

const MotionDiv = motion.div;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ elevated = false, interactive = false, className, children, ...props }, ref) => {
    return (
      <MotionDiv
        ref={ref}
        className={cn(
          'rounded-xl border bg-card text-card-foreground shadow',
          elevated && 'shadow-lg',
          interactive && 'cursor-pointer transition-shadow hover:shadow-md',
          className
        )}
        initial={false}
        whileHover={interactive ? { y: -2 } : undefined}
        transition={{ duration: 0.2 }}
        {...(props as any)}
      >
        {children}
      </MotionDiv>
    );
  }
);

Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
CardDescription.displayName = 'CardDescription';

export const CardContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
);
CardContent.displayName = 'CardContent';

export const CardFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
);
CardFooter.displayName = 'CardFooter';
