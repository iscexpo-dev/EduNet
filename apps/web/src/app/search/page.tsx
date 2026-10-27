'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@edunet/auth';
import { Button, Card, CardContent, CardHeader, EmptyState } from '@edunet/ui';
import { apiUrl } from '@/lib/api-url';
import { readApiError } from '@/lib/api-error';

interface SearchResultItem {
  id: string;
  courseId?: string;
  title?: string;
  name?: string;
  email?: string;
  role?: string;
  subject?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  courseTitle?: string;
  description?: string | null;
}

interface CourseFacet {
  subject: string | null;
  count: number;
}

interface RoleFacet {
  role: string;
  count: number;
}

interface Facets {
  courses?: { total: number; bySubject: CourseFacet[] };
  users?: { total: number; byRole: RoleFacet[] };
  assignments?: { total: number };
  organizations?: { total: number };
}

interface AllSearchResponse {
  courses: SearchResultItem[];
  users: SearchResultItem[];
  assignments: SearchResultItem[];
  facets?: Facets;
}

type SearchResponse = AllSearchResponse | SearchResultItem[];

const TYPE_LABELS: Record<string, string> = {
  all: 'Everything',
  courses: 'Courses',
  users: 'People',
  assignments: 'Assignments',
  organizations: 'Organizations',
};

function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function itemTitle(item: SearchResultItem): string {
  return item.title ?? item.name ?? item.email ?? 'Untitled';
}

function itemSubtitle(item: SearchResultItem): string {
  const parts: string[] = [];
  if (item.subject) parts.push(item.subject);
  if (item.courseTitle) parts.push(`Course: ${item.courseTitle}`);
  if (item.role) parts.push(item.role);
  if (item.email) parts.push(item.email);
  return parts.join(' · ');
}

export default function SearchPage() {
  const { user, token, isLoading } = useAuth();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [facets, setFacets] = useState(false);
  const [results, setResults] = useState<SearchResponse>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;

    const runSearch = async () => {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        params.set('type', type);
        if (facets) params.set('facets', '1');

        const response = await fetch(apiUrl(`/api/search?${params.toString()}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(await readApiError(response));
        const data = (await response.json()) as SearchResponse;
        if (cancelled) return;
        setResults(data);
        setError('');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Search failed.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    runSearch();
    return () => {
      cancelled = true;
    };
  }, [token, user, query, type, facets, reloadKey]);

  const isAll = type === 'all';
  const typedResults = isAll ? undefined : (results as SearchResultItem[]);
  const allResults = isAll ? (results as AllSearchResponse) : undefined;
  const allFacets = isAll ? (results as AllSearchResponse).facets : undefined;
  const singleFacet = !isAll ? (results as { facets?: FacetSummary }).facets : undefined;

  const hasResults = isAll
    ? (allResults?.courses?.length ?? 0) > 0 ||
      (allResults?.users?.length ?? 0) > 0 ||
      (allResults?.assignments?.length ?? 0) > 0
    : (typedResults?.length ?? 0) > 0;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-gray-700">Please log in to search.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="border-b bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Search</h1>
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button variant="secondary" size="sm">
                Back to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <CardContent className="pt-6 pb-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setReloadKey((key) => key + 1);
              }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 min-w-0">
                  <label htmlFor="search-query" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Search
                  </label>
                  <input
                    id="search-query"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search courses, people and assignments…"
                    className="w-full rounded border px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-800"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <select
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                    className="rounded border px-3 py-2 text-sm dark:bg-gray-900 dark:border-gray-800"
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={facets}
                      onChange={(event) => setFacets(event.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-900 dark:border-gray-800"
                    />
                    Show facet counts
                  </label>
                </div>
                <Button type="submit" variant="primary">
                  Search
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLoading(true);
                  setError('');
                  setReloadKey((key) => key + 1);
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <Card>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300">Searching…</p>
            </CardContent>
          </Card>
        ) : query.trim() === '' ? (
          <Card>
            <CardContent>
              <p className="text-gray-600 dark:text-gray-300">
                Enter a search term to find courses, people and assignments.
              </p>
            </CardContent>
          </Card>
        ) : !hasResults ? (
          <Card>
            <CardContent>
              <EmptyState
                title="No results"
                description="Try a different search term or check your filters."
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {isAll && (
              <div className="grid grid-cols-1 gap-6">
                {renderSection('Courses', allResults!.courses, allFacets?.courses)}
                {renderSection('People', allResults!.users, allFacets?.users)}
                {renderSection('Assignments', allResults!.assignments, allFacets?.assignments)}
              </div>
            )}
            {!isAll && (
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold">
                    {TYPE_LABELS[type]} ({typedResults!.length})
                  </h2>
                </CardHeader>
                <CardContent>
                  {renderFacetSummary(singleFacet)}
                  <ul className="divide-y dark:divide-gray-800 mt-4">
                    {typedResults!.map((item) => renderItem(item))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );

  function renderSection(
    title: string,
    items: SearchResultItem[],
    facet: Facets['courses'] | Facets['users'] | Facets['assignments'] | Facets['organizations'] | undefined,
  ) {
    return (
      <Card key={title}>
        <CardHeader>
          <h2 className="text-lg font-semibold">{title} ({items.length})</h2>
        </CardHeader>
        <CardContent>
          {facet && renderFacetSummary(facet)}
          <ul className={`divide-y dark:divide-gray-800 mt-4 ${items.length === 0 ? 'empty' : ''}`}>
            {items.length === 0 ? (
              <li className="py-8 text-center">
                <p className="text-sm text-gray-500">No {title.toLowerCase()} found.</p>
              </li>
            ) : (
              items.map((item) => renderItem(item))
            )}
          </ul>
        </CardContent>
      </Card>
    );
  }

  interface FacetSummary {
    total?: number;
    bySubject?: CourseFacet[];
    byRole?: RoleFacet[];
  }

  function renderFacetSummary(facet: FacetSummary | undefined) {
    if (!facet) return null;
    const lines: React.ReactNode[] = [];
    if (facet.bySubject) {
      lines.push(
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
          By subject
        </p>
      );
      lines.push(
        <ul className="flex flex-wrap gap-4 mb-4 text-sm">
          {facet.bySubject.map((entry) => (
            <li key={String(entry.subject)} className="flex flex-col gap-1">
              <span className="font-medium">{entry.subject ?? '(none)'}</span>
              <span className="text-gray-500">{entry.count}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (facet.byRole) {
      lines.push(
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
          By role
        </p>
      );
      lines.push(
        <ul className="flex flex-wrap gap-4 mb-4 text-sm">
          {facet.byRole.map((entry) => (
            <li key={entry.role} className="flex flex-col gap-1">
              <span className="font-medium">{entry.role}</span>
              <span className="text-gray-500">{entry.count}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (facet.total !== undefined) {
      lines.push(
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {facet.total} result{facet.total === 1 ? '' : 's'}
        </p>
      );
    }
    return <div className="space-y-2">{lines}</div>;
  }

  function renderItem(item: SearchResultItem) {
    const href = item.courseId ? `/my-courses/${item.courseId}` : '/courses';
    return (
      <li key={item.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link href={href} className="text-primary-600 hover:underline">
            {itemTitle(item)}
          </Link>
          <p className="text-xs text-gray-500">{itemSubtitle(item)}</p>
          {item.createdAt && (
            <p className="text-xs text-gray-500">
              Added {formatDate(item.createdAt)}
            </p>
          )}
        </div>
      </li>
    );
  }
}
