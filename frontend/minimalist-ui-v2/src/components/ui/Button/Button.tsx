/**
 * Button component - Generic reusable UI component
 * Pure presentation with zero business logic
 * Based on shadcn/ui with Framer Motion animations
 */

import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        primary: 'bg-primary text-primary-foreground shadow hover:bg-primary/90', // Alias for default
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        danger: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90', // Alias for destructive
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        md: 'h-9 px-4 py-2', // Alias for default
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends ComponentPropsWithoutRef<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  fullWidth?: boolean;
}

const MotionButton = motion.button;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, fullWidth = false, ...props }, ref) => {
    const Comp = asChild ? Slot : MotionButton;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), fullWidth && 'w-full')}
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15 }}
        {...(props as any)}
      />
    );
  }
);

Button.displayName = 'Button';
