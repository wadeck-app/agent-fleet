import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { Toast, ToastVariant, ToastViewport } from '../components/ui/Toast';

interface ToastMessage {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: Omit<ToastMessage, 'id'>) => void;
  showSuccess: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showInfo: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: Omit<ToastMessage, 'id'>) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { ...message, id }]);
  }, []);

  const showSuccess = useCallback(
    (title: string, description?: string) => {
      showToast({ title, description, variant: 'success' });
    },
    [showToast]
  );

  const showError = useCallback(
    (title: string, description?: string) => {
      showToast({ title, description, variant: 'error' });
    },
    [showToast]
  );

  const showInfo = useCallback(
    (title: string, description?: string) => {
      showToast({ title, description, variant: 'info' });
    },
    [showToast]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showInfo }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                removeToast(toast.id);
              }
            }}
            title={toast.title}
            description={toast.description}
            variant={toast.variant}
            duration={toast.duration}
          />
        ))}
        <ToastViewport />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
};
