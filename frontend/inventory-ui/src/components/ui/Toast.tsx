import { ReactNode } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import styles from './Toast.module.scss';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

export const Toast = ({
  open,
  onOpenChange,
  title,
  description,
  variant = 'info',
  duration = 5000,
}: ToastProps) => {
  return (
    <ToastPrimitive.Root
      className={`${styles.toast} ${styles[`toast--${variant}`]}`}
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
    >
      {title && (
        <ToastPrimitive.Title className={styles.toast__title}>
          {title}
        </ToastPrimitive.Title>
      )}
      {description && (
        <ToastPrimitive.Description className={styles.toast__description}>
          {description}
        </ToastPrimitive.Description>
      )}
      <ToastPrimitive.Close className={styles.toast__close} aria-label="Close">
        <span aria-hidden>×</span>
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
};

export const ToastViewport = () => {
  return <ToastPrimitive.Viewport className={styles.toastViewport} />;
};
