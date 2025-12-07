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
import styles from './Button.module.scss';

const buttonVariants = cva(styles.button, {
  variants: {
    variant: {
      primary: styles['variant-primary'],
      secondary: styles['variant-secondary'],
      ghost: styles['variant-ghost'],
      danger: styles['variant-danger'],
    },
    size: {
      sm: styles['size-sm'],
      md: styles['size-md'],
      lg: styles['size-lg'],
    },
    fullWidth: {
      true: styles.fullWidth,
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export interface ButtonProps
  extends ComponentPropsWithoutRef<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const MotionButton = motion.button;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, fullWidth, asChild = false, className, children, ...props }, ref) => {
    const Comp = asChild ? Slot : MotionButton;

    const motionProps = !asChild ? {
      whileHover: { scale: 1.02 },
      whileTap: { scale: 0.98 },
      transition: { type: 'spring', stiffness: 400, damping: 17 },
    } : {};

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        {...motionProps}
        {...(props as any)}
      >
        {children}
      </Comp>
    );
  }
);

Button.displayName = 'Button';
