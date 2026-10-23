import React from 'react';
import { cn } from '@edunet/ui/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Compact: show "Page X of Y" with prev/next only. Useful on small/low-bandwidth screens. */
  compact?: boolean;
  siblingCount?: number;
}

/** Accessible pagination. `aria-current` marks the active page; disabled
 *  prev/next at the bounds. No page counter is fabricated when total is
 *  unknown (callers pass a computed totalPages). */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onChange,
  compact = false,
  siblingCount = 1,
}) => {
  if (totalPages <= 1) return null;

  const pages = new Set<number>([1, totalPages, page]);
  for (let offset = 1; offset <= siblingCount; offset += 1) {
    if (page - offset > 1) pages.add(page - offset);
    if (page + offset < totalPages) pages.add(page + offset);
  }
  const ordered = Array.from(pages).sort((a, b) => a - b);

  const buttonClass = (active: boolean) =>
    cn(
      'px-3 py-1.5 text-sm rounded-md border transition-colors',
      active
        ? 'bg-blue-600 border-blue-600 text-white'
        : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
    );

  return (
    <nav aria-label="Pagination" className="flex items-center gap-1">
      <button
        type="button"
        className={buttonClass(false)}
        disabled={page <= 1}
        aria-label="Previous page"
        onClick={() => onChange(page - 1)}
      >
        ‹
      </button>

      {compact
        ? <span className="mx-2 text-sm text-gray-600 dark:text-gray-300">Page {page} of {totalPages}</span>
        : ordered.map((value, index) => {
            const previous = ordered[index - 1];
            const gap = previous !== undefined && value - previous > 1;
            return (
              <React.Fragment key={value}>
                {gap && <span aria-hidden="true" className="px-1 text-gray-400">…</span>}
                <button
                  type="button"
                  className={buttonClass(value === page)}
                  aria-current={value === page ? 'page' : undefined}
                  aria-label={`Page ${value}`}
                  onClick={() => onChange(value)}
                >
                  {value}
                </button>
              </React.Fragment>
            );
          })}

      <button
        type="button"
        className={buttonClass(false)}
        disabled={page >= totalPages}
        aria-label="Next page"
        onClick={() => onChange(page + 1)}
      >
        ›
      </button>
    </nav>
  );
};
