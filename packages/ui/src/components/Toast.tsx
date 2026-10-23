import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { cn } from '@edunet/ui/lib/utils';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  notify: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  info: 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700',
  success: 'bg-green-50 dark:bg-green-900/40 text-green-900 dark:text-green-100 border-green-200 dark:border-green-700',
  warning: 'bg-amber-50 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-600',
  error: 'bg-red-50 dark:bg-red-900/40 text-red-900 dark:text-red-100 border-red-200 dark:border-red-700',
};

const VARIANT_ROLES: Record<ToastVariant, 'status' | 'alert'> = {
  info: 'status',
  success: 'status',
  warning: 'alert',
  error: 'alert',
};

export const ToastProvider: React.FC<{ children: React.ReactNode; maxVisible?: number }> = ({
  children,
  maxVisible = 5,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const notify = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current, { id, message, variant }].slice(-maxVisible));
      setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 5000);
    },
    [maxVisible],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live region so screen readers announce toasts without a focus steal */}
      <div aria-live="polite" aria-atomic="false" className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={VARIANT_ROLES[toast.variant]}
            className={cn('border rounded-md shadow-md px-4 py-3 text-sm', VARIANT_CLASSES[toast.variant])}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
