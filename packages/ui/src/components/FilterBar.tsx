import React from 'react';
import { cn } from '@edunet/ui/lib/utils';

interface DropdownOption {
  id: string;
  label: string;
}

interface FilterBarProps {
  filters: {
    id: string;
    label: string;
    value?: string;
    options: DropdownOption[];
    onChange: (id: string, value: string | undefined) => void;
  }[];
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
}

/** Course/page filtering bar with selects and optional text search. */
export const FilterBar: React.FC<FilterBarProps> = ({ filters, search }) => (
  <div className="flex flex-wrap gap-2 items-center">
    {search && (
      <input
        type="search"
        value={search.value}
        onChange={(event) => search.onChange(event.target.value)}
        placeholder={search.placeholder}
        aria-label={search.placeholder ?? 'Search'}
        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-w-0 flex-shrink"
      />
    )}
    {filters.map((filter) => (
      <select
        key={filter.id}
        value={filter.value ?? ''}
        onChange={(event) => {
          filter.onChange(filter.id, event.target.value || undefined);
        }}
        aria-label={filter.label}
        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      >
        <option value="">{filter.label}</option>
        {filter.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    ))}
  </div>
);
