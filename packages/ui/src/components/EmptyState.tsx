import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Shared empty-state with i18n-ready props. Used across all list and
 *  dashboard screens so empty pages look intentional, not broken. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    {icon && <div className="mb-3 text-gray-400 dark:text-gray-500">{icon}</div>}
    <p className="text-base font-medium text-gray-700 dark:text-gray-200">{title}</p>
    {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
