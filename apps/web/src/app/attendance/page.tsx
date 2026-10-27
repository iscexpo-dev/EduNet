'use client';

import { apiUrl } from '@/lib/api-url';
import { readApiError } from '@/lib/api-error';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button, EmptyState } from '@edunet/ui';
import Link from 'next/link';

interface Child {
  id: string;
  firstName: string;
  lastName: string;
}

interface SchoolClass {
  id: string;
  name: string;
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface AttendanceRecord {
  id: string;
  classId: string;
  date: string;
  status: AttendanceStatus;
  notes: string | null;
}

interface AttendanceSummary {
  studentId: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

const RANGE_OPTIONS = [
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 365 days', value: 365 },
];

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  late: 'bg-yellow-100 text-yellow-800',
  excused: 'bg-blue-100 text-blue-700',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

export default function AttendancePage() {
  const { user, token, isLoading } = useAuth();
  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent';

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [childrenLoading, setChildrenLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [childrenError, setChildrenError] = useState('');
  const [error, setError] = useState('');
  const [childrenReload, setChildrenReload] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token || !isParent) return;
    let cancelled = false;

    const loadChildren = async () => {
      try {
        const response = await fetch(apiUrl('/api/parents/children'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(await readApiError(response));
        const data: Child[] = await response.json();
        if (cancelled) return;

        setChildren(data);
        setSelectedChildId((current) =>
          data.some((child) => child.id === current) ? current : (data[0]?.id ?? ''),
        );
        if (data.length > 0) setLoading(true);
        setChildrenError('');
      } catch (err) {
        if (cancelled) return;
        setChildrenError(err instanceof Error ? err.message : 'Unable to load children');
      } finally {
        if (!cancelled) setChildrenLoading(false);
      }
    };

    loadChildren();
    return () => {
      cancelled = true;
    };
  }, [token, isParent, childrenReload]);

  useEffect(() => {
    if (!token || (!isStudent && !isParent)) return;
    let cancelled = false;

    const loadClasses = async () => {
      try {
        const response = await fetch(apiUrl('/api/platform/academics/classes'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data: SchoolClass[] = await response.json();
        if (!cancelled) setClasses(data);
      } catch {
        if (!cancelled) setClasses([]);
      }
    };

    loadClasses();
    return () => {
      cancelled = true;
    };
  }, [token, isStudent, isParent]);

  useEffect(() => {
    if (!token || (!isStudent && !isParent)) return;
    if (isParent && !selectedChildId) return;
    let cancelled = false;

    const loadAttendance = async () => {
      try {
        const from = new Date();
        from.setDate(from.getDate() - rangeDays);
        const range = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(
          new Date().toISOString(),
        )}`;
        const studentFilter =
          isParent && selectedChildId
            ? `&studentId=${encodeURIComponent(selectedChildId)}`
            : '';
        const headers = { Authorization: `Bearer ${token}` };

        const [recordsResponse, summaryResponse] = await Promise.all([
          fetch(apiUrl(`/api/platform/attendance?${range}${studentFilter}`), { headers }),
          fetch(apiUrl(`/api/platform/attendance/summary?${range}${studentFilter}`), {
            headers,
          }),
        ]);

        if (!recordsResponse.ok) throw new Error(await readApiError(recordsResponse));
        if (!summaryResponse.ok) throw new Error(await readApiError(summaryResponse));

        const [recordData, summaryData] = await Promise.all([
          recordsResponse.json() as Promise<AttendanceRecord[]>,
          summaryResponse.json() as Promise<AttendanceSummary[]>,
        ]);
        if (cancelled) return;

        setRecords(recordData);
        setSummary(summaryData[0] ?? null);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load attendance');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [token, isStudent, isParent, selectedChildId, rangeDays, reloadKey]);

  const classNames = useMemo(
    () => new Map(classes.map((item) => [item.id, item.name])),
    [classes],
  );

  const counts = useMemo(() => {
    const totals: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    for (const record of records) totals[record.status] += 1;
    return totals;
  }, [records]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-700">Please log in to view attendance.</p>
        <Link href="/login">
          <Button>Go to login</Button>
        </Link>
      </div>
    );
  }

  if (!isStudent && !isParent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <EmptyState
          title="Student or parent access only"
          description="Teachers can mark attendance from the teacher workspace."
          action={
            <Link href="/dashboard">
              <Button variant="secondary">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (isParent && childrenLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading your children…</p>
      </div>
    );
  }

  if (isParent && childrenError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error: {childrenError}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setChildrenLoading(true);
              setChildrenReload((key) => key + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (isParent && children.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <EmptyState
          title="No linked children"
          description="Ask your school administrator to link your parent account to your child's account."
          action={
            <Link href="/parent">
              <Button variant="secondary">Back to parent dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const selectedChild = children.find((child) => child.id === selectedChildId);
  const rate = summary?.rate ?? (records.length ? null : 0);
  const backHref = isParent ? '/parent' : '/dashboard';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 shadow-sm border-b dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Attendance</h1>
          <Link href={backHref}>
            <Button variant="secondary" size="sm">
              {isParent ? 'Back to parent dashboard' : 'Back to dashboard'}
            </Button>
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {isParent && (
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Child</p>
            <div className="flex flex-wrap gap-2" role="list" aria-label="Linked children">
              {children.map((child) => (
                <Button
                  key={child.id}
                  variant={child.id === selectedChildId ? 'primary' : 'outline'}
                  aria-pressed={child.id === selectedChildId}
                  onClick={() => {
                    setSelectedChildId(child.id);
                    setLoading(true);
                    setError('');
                  }}
                >
                  {child.firstName} {child.lastName}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Student</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isParent
                ? selectedChild
                  ? `${selectedChild.firstName} ${selectedChild.lastName}`
                  : '—'
                : `${user.firstName} ${user.lastName}`}
            </p>
          </div>
          <div>
            <label htmlFor="attendance-range" className="block text-sm font-medium mb-1">
              Period
            </label>
            <select
              id="attendance-range"
              className="border rounded px-3 py-2 bg-white dark:bg-gray-900"
              value={rangeDays}
              onChange={(event) => {
                setRangeDays(Number(event.target.value));
                setLoading(true);
                setError('');
              }}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="border rounded-lg p-8 text-center bg-white dark:bg-gray-900">
            <p className="text-gray-600 dark:text-gray-300">Loading attendance…</p>
          </div>
        ) : error ? (
          <div className="border rounded-lg p-8 text-center bg-white dark:bg-gray-900">
            <p className="text-red-600 mb-4">Error: {error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setReloadKey((key) => key + 1);
              }}
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-900">
                <p className="text-sm text-gray-500">Attendance rate</p>
                <p className="text-2xl font-bold">
                  {rate === null ? '—' : `${rate}%`}
                </p>
              </div>
              {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map(
                (status) => (
                  <div key={status} className="border rounded-lg p-4 bg-white dark:bg-gray-900">
                    <p className="text-sm text-gray-500 capitalize">{status}</p>
                    <p className="text-2xl font-bold">{counts[status]}</p>
                  </div>
                ),
              )}
            </div>

            <section className="border rounded-lg bg-white dark:bg-gray-900">
              {records.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-gray-600 dark:text-gray-300">
                    No attendance records for this period.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto p-6">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="py-2 pr-4 font-medium">Date</th>
                        <th className="py-2 pr-4 font-medium">Class</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr key={record.id} className="border-b last:border-b-0">
                          <td className="py-3 pr-4">{formatDate(record.date)}</td>
                          <td className="py-3 pr-4 text-gray-500">
                            {classNames.get(record.classId) ?? 'Class'}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${STATUS_STYLES[record.status]}`}
                            >
                              {record.status}
                            </span>
                          </td>
                          <td className="py-3 text-gray-500">{record.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
