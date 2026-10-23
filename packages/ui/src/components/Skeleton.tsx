import React from 'react';
import { cn } from '@edunet/ui/lib/utils';

interface SkeletonProps {
  className?: string;
  /** Slower pulse respects reduced-motion preferences. */
  animated?: boolean;
}

/** Loading placeholder. Purely decorative — hidden from assistive tech. */
export const Skeleton: React.FC<SkeletonProps> = ({ className, animated = true }) => (
  <div
    aria-hidden="true"
    className={cn(
      'rounded-md bg-gray-200 dark:bg-gray-700',
      animated && 'motion-safe:animate-pulse',
      className,
    )}
  />
);

export const SkeletonText: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="space-y-2">
    {Array.from({ length: lines }, (_, index) => (
      <Skeleton key={index} className={cn('h-4', index === lines - 1 ? 'w-2/3' : 'w-full')} />
    ))}
  </div>
);
