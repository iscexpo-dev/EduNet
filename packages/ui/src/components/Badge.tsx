import React from 'react';
import { cn } from '@edunet/ui/lib/utils';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200',
  success: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200',
  warning: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200',
  error: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
  info: 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-200',
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', children, className }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      VARIANT_CLASSES[variant],
      className,
    )}
  >
    {children}
  </span>
);
