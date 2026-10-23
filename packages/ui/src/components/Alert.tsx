import React from 'react';
import { cn } from '@edunet/ui/lib/utils';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  variant: AlertVariant;
  title?: string;
  children: React.ReactNode;
  /** Renders with role="alert" for live announcements; disable for static text. */
  urgent?: boolean;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: 'bg-sky-50 dark:bg-sky-900/40 border-sky-200 dark:border-sky-700 text-sky-900 dark:text-sky-100',
  success:
    'bg-green-50 dark:bg-green-900/40 border-green-200 dark:border-green-700 text-green-900 dark:text-green-100',
  warning:
    'bg-amber-50 dark:bg-amber-900/40 border-amber-200 dark:border-amber-600 text-amber-900 dark:text-amber-100',
  error: 'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-700 text-red-900 dark:text-red-100',
};

export const Alert: React.FC<AlertProps> = ({ variant, title, children, urgent = false }) => (
  <div
    role={urgent ? 'alert' : 'note'}
    className={cn('border-l-4 border rounded-md px-4 py-3 text-sm', VARIANT_CLASSES[variant])}
  >
    {title && <p className="font-semibold mb-1">{title}</p>}
    <div>{children}</div>
  </div>
);
