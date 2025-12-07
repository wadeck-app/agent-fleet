/**
 * Button component - Generic reusable UI component
 * Based on shadcn/ui with Framer Motion animations
 * Pure presentation with zero business logic
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium font-mono transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow hover:bg-primary/90 border border-primary',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 border border-border',
        ghost: 'hover:bg-accent hover:text-accent-foreground border border-transparent',
        danger:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 border border-destructive',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        md: 'h-9 px-4 py-2',
        lg: 'h-10 rounded-md px-8',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, fullWidth = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : motion.button;

    // Framer Motion animation variants
    const buttonAnimation = {
      rest: { scale: 1 },
      hover: { scale: 1.02 },
      tap: { scale: 0.98 },
    };

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), fullWidth && 'w-full')}
        ref={ref}
        variants={!asChild ? buttonAnimation : undefined}
        initial={!asChild ? 'rest' : undefined}
        whileHover={!asChild ? 'hover' : undefined}
        whileTap={!asChild ? 'tap' : undefined}
        transition={!asChild ? { type: 'spring', stiffness: 400, damping: 17 } : undefined}
        {...(props as any)}
      >
        {children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
