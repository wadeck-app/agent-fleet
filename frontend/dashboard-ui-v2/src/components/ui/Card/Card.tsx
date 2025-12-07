/**
 * Card - Generic UI Component
 * Pure presentation component with zero business logic
 * Based on shadcn/ui with Framer Motion animations
 */

import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import styles from './Card.module.scss';

const cardVariants = cva(styles.card, {
  variants: {
    elevated: {
      true: styles.elevated,
    },
    interactive: {
      true: styles.interactive,
    },
  },
});

export interface CardProps
  extends ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof cardVariants> {}

const MotionDiv = motion.div;

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ elevated = false, interactive = false, className, children, ...props }, ref) => {
    const motionProps = interactive
      ? {
          whileHover: { scale: 1.02, y: -4 },
          transition: { type: 'spring', stiffness: 300, damping: 20 },
        }
      : {};

    return (
      <MotionDiv
        ref={ref}
        className={cn(cardVariants({ elevated, interactive, className }))}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        {...motionProps}
        {...(props as any)}
      >
        {children}
      </MotionDiv>
    );
  }
);

Card.displayName = 'Card';
