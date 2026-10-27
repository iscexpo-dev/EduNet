'use client';

import { apiUrl } from '@/lib/api-url';
import { readApiError } from '@/lib/api-error';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';

interface SchoolClass {
  id: string;
  name: string;
  gradeLevel: string | null;
  capacity: number;
}

interface RosterStudent {
  id: string;
  studentId: string;
  sectionId: string | null;
  status: string;
  firstName: string;
  lastName: string;
}

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface AttendanceRecord {
  id: string;
  studentId: string;
  status: AttendanceStatus;
  notes: string | null;
}

const STATUS_OPTIONS: AttendanceStatus[] = ['present', 'absent', 'late', 'excused'];

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function TeacherAttendancePage() {
  const { user, token } = useAuth();

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [date, setDate] = useState(today);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [classesLoading, setClassesLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');
  const [rosterError, setRosterError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [classesReload, setClassesReload] = useState(0);
  const [rosterReload, setRosterReload] = useState(0);

  useEffect(() => {
    if (!user || !token || user.role !== 'teacher') return;
    let cancelled = false;

    const loadClasses = async () => {
      try {
        const response = await fetch(
          apiUrl('/api/platform/academics/classes?mine=true'),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!response.ok) throw new Error(await readApiError(response));
        const data: SchoolClass[] = await response.json();
        if (cancelled) return;

        setClasses(data);
        setPageError('');
        setSelectedClassId((current) =>
          data.some((item) => item.id === current) ? current : (data[0]?.id ?? ''),
        );
        if (data.length > 0) setRosterLoading(true);
      } catch (err) {
        if (cancelled) return;
        setPageError(err instanceof Error ? err.message : 'Failed to load classes');
      } finally {
        if (!cancelled) setClassesLoading(false);
      }
    };

    loadClasses();
    return () => {
      cancelled = true;
    };
  }, [user, token, classesReload]);

  useEffect(() => {
    if (!user || !token || !selectedClassId || !date) return;
    let cancelled = false;

    const loadRoster = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const from = `${date}T00:00:00.000Z`;
        const to = `${date}T23:59:59.999Z`;
        const [rosterResponse, attendanceResponse] = await Promise.all([
          fetch(apiUrl(`/api/platform/academics/classes/${selectedClassId}/enrollments`), {
            headers,
          }),
          fetch(
            apiUrl(
              `/api/platform/attendance?classId=${selectedClassId}&from=${from}&to=${to}`,
            ),
            { headers },
          ),
        ]);

        if (!rosterResponse.ok) throw new Error(await readApiError(rosterResponse));
        if (!attendanceResponse.ok) {
          throw new Error(await readApiError(attendanceResponse));
        }

        const [rosterData, attendanceData] = await Promise.all([
          rosterResponse.json() as Promise<RosterStudent[]>,
          attendanceResponse.json() as Promise<AttendanceRecord[]>,
        ]);
        if (cancelled) return;

        const active = rosterData.filter((student) => student.status === 'active');
        const initial: Record<string, AttendanceStatus> = {};
        for (const student of active) initial[student.studentId] = 'present';
        for (const record of attendanceData) {
          if (record.studentId in initial) initial[record.studentId] = record.status;
        }

        setRoster(active);
        setStatuses(initial);
        setRosterError('');
        setSaveError('');
        setSuccess('');
      } catch (err) {
        if (cancelled) return;
        setRosterError(err instanceof Error ? err.message : 'Failed to load attendance');
      } finally {
        if (!cancelled) setRosterLoading(false);
      }
    };

    loadRoster();
    return () => {
      cancelled = true;
    };
  }, [user, token, selectedClassId, date, rosterReload]);

  const counts = useMemo(() => {
    const totals: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    for (const student of roster) {
      totals[statuses[student.studentId] ?? 'present'] += 1;
    }
    return totals;
  }, [roster, statuses]);

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? null;

  const saveAttendance = async () => {
    if (!selectedClassId || !date || roster.length === 0 || !token) return;
    setSaving(true);
    setSaveError('');
    setSuccess('');

    try {
      const response = await fetch(apiUrl('/api/platform/attendance'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classId: selectedClassId,
          date,
          records: roster.map((student) => ({
            studentId: student.studentId,
            status: statuses[student.studentId] ?? 'present',
            ...(student.sectionId ? { sectionId: student.sectionId } : {}),
          })),
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));

      setSuccess(
        `Attendance saved for ${roster.length} student${roster.length === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  if (!user || user.role !== 'teacher') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Teacher access required</p>
      </div>
    );
  }

  if (classesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading classes...</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error: {pageError}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setClassesLoading(true);
              setClassesReload((key) => key + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Attendance</h1>
            <p className="text-gray-600 mt-2">
              Mark daily attendance for classes you own or teach.
            </p>
          </div>
          <Link href="/teacher">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>

        {classes.length === 0 ? (
          <div className="border rounded-lg p-8 text-center">
            <p className="text-gray-600">
              No classes are assigned to you as homeroom teacher or subject teacher.
            </p>
          </div>
        ) : (
          <>
            <div className="border rounded-lg p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="attendance-class" className="block text-sm font-medium mb-1">
                    Class
                  </label>
                  <select
                    id="attendance-class"
                    className="w-full border rounded px-3 py-2"
                    value={selectedClassId}
                    onChange={(event) => {
                      setSelectedClassId(event.target.value);
                      setRosterLoading(true);
                      setRosterError('');
                      setSuccess('');
                      setSaveError('');
                    }}
                  >
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.gradeLevel ? ` (Grade ${item.gradeLevel})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="attendance-date" className="block text-sm font-medium mb-1">
                    Date
                  </label>
                  <input
                    id="attendance-date"
                    type="date"
                    className="w-full border rounded px-3 py-2"
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value);
                      setRosterLoading(true);
                      setRosterError('');
                      setSuccess('');
                      setSaveError('');
                    }}
                  />
                </div>
              </div>
            </div>

            {rosterLoading ? (
              <div className="border rounded-lg p-8 text-center">
                <p>Loading roster...</p>
              </div>
            ) : rosterError ? (
              <div className="border rounded-lg p-8 text-center">
                <p className="text-red-600 mb-4">Error: {rosterError}</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRosterLoading(true);
                    setRosterReload((key) => key + 1);
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : roster.length === 0 ? (
              <div className="border rounded-lg p-8 text-center">
                <p className="text-gray-600">
                  No active students are enrolled in {selectedClass?.name ?? 'this class'}.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {STATUS_OPTIONS.map((status) => (
                    <div key={status} className="border rounded-lg p-4">
                      <p className="text-sm text-gray-500 capitalize">{status}</p>
                      <p className="text-2xl font-bold">{counts[status]}</p>
                    </div>
                  ))}
                </div>

                <div className="border rounded-lg p-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b text-gray-500">
                          <th className="py-2 pr-4 font-medium">Student</th>
                          <th className="py-2 pr-4 font-medium">Enrollment</th>
                          <th className="py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roster.map((student) => (
                          <tr key={student.id} className="border-b last:border-b-0">
                            <td className="py-3 pr-4 font-medium">
                              {student.firstName} {student.lastName}
                            </td>
                            <td className="py-3 pr-4 text-gray-500">
                              {student.status}
                            </td>
                            <td className="py-3">
                              <select
                                aria-label={`Attendance for ${student.firstName} ${student.lastName}`}
                                className="border rounded px-3 py-1.5"
                                value={statuses[student.studentId] ?? 'present'}
                                onChange={(event) => {
                                  const value = event.target.value as AttendanceStatus;
                                  setStatuses((current) => ({
                                    ...current,
                                    [student.studentId]: value,
                                  }));
                                  setSuccess('');
                                }}
                              >
                                {STATUS_OPTIONS.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between mt-6">
                    <div>
                      {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
                      {success && (
                        <p className="text-green-700 text-sm" role="status">
                          {success}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="primary"
                      onClick={saveAttendance}
                      disabled={saving || !date}
                    >
                      {saving ? 'Saving...' : 'Save attendance'}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
