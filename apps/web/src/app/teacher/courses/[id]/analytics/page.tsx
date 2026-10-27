'use client';

import { apiUrl } from '@/lib/api-url';
import { readApiError } from '@/lib/api-error';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface CourseSummary {
  enrollmentCount: number;
  assignmentCount: number;
  submissionsCount: number;
  gradedSubmissions: number;
  averageGrade: number | null;
  averagePercent: number | null;
}

interface StudentPerformanceRow {
  submissionId: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  assignmentId: string;
  assignmentTitle: string;
  grade: number | null;
  submittedAt: string;
  maxPoints: number;
}

interface AssignmentPerformanceRow {
  assignmentId: string;
  assignmentTitle: string;
  dueDate: string;
  maxPoints: number;
  submissionCount: number;
  averageGrade: string | number | null;
}

interface CourseEngagement {
  days: number;
  recentSubmissions: number;
  recentEnrollments: number;
}

interface StudentSummary {
  id: string;
  name: string;
  submissions: number;
  graded: number;
  averagePercent: number | null;
  lastSubmittedAt: string;
}

function percentOf(grade: number | string | null, maxPoints: number | string): number | null {
  if (grade === null) return null;
  const score = Number(grade);
  const max = Number(maxPoints);
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((Math.min(Math.max(score, 0), max) / max) * 10000) / 100;
}

export default function TeacherCourseAnalyticsPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;

  const [summary, setSummary] = useState<CourseSummary | null>(null);
  const [studentRows, setStudentRows] = useState<StudentPerformanceRow[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<AssignmentPerformanceRow[]>([]);
  const [engagement, setEngagement] = useState<CourseEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user || !token || !courseId) return;
    let cancelled = false;

    const load = async () => {
      const headers = { Authorization: `Bearer ${token}` };
      const base = `/api/analytics/courses/${courseId}`;

      try {
        const responses = await Promise.all([
          fetch(apiUrl(`${base}/analytics`), { headers }),
          fetch(apiUrl(`${base}/analytics/students`), { headers }),
          fetch(apiUrl(`${base}/analytics/assignments`), { headers }),
          fetch(apiUrl(`${base}/analytics/engagement`), { headers }),
        ]);

        for (const response of responses) {
          if (!response.ok) throw new Error(await readApiError(response));
        }

        const [summaryData, studentData, assignmentData, engagementData] =
          await Promise.all(responses.map((response) => response.json()));

        if (cancelled) return;
        setSummary(summaryData);
        setStudentRows(studentData);
        setAssignmentRows(assignmentData);
        setEngagement(engagementData);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, token, courseId, reloadKey]);

  const students = useMemo<StudentSummary[]>(() => {
    const byStudent = new Map<
      string,
      { name: string; submissions: number; graded: number; percentTotal: number; lastSubmittedAt: string }
    >();

    for (const row of studentRows) {
      const percent = percentOf(row.grade, row.maxPoints);
      const existing = byStudent.get(row.studentId) ?? {
        name: `${row.studentFirstName} ${row.studentLastName}`.trim(),
        submissions: 0,
        graded: 0,
        percentTotal: 0,
        lastSubmittedAt: row.submittedAt,
      };

      existing.submissions += 1;
      if (percent !== null) {
        existing.graded += 1;
        existing.percentTotal += percent;
      }
      if (new Date(row.submittedAt) > new Date(existing.lastSubmittedAt)) {
        existing.lastSubmittedAt = row.submittedAt;
      }
      byStudent.set(row.studentId, existing);
    }

    return Array.from(byStudent.entries())
      .map(([id, value]) => ({
        id,
        name: value.name,
        submissions: value.submissions,
        graded: value.graded,
        averagePercent:
          value.graded > 0
            ? Math.round((value.percentTotal / value.graded) * 100) / 100
            : null,
        lastSubmittedAt: value.lastSubmittedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [studentRows]);

  if (!user || user.role !== 'teacher') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Teacher access required</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
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
      </div>
    );
  }

  const summaryCards = [
    { label: 'Enrolled students', value: summary?.enrollmentCount ?? 0 },
    { label: 'Assignments', value: summary?.assignmentCount ?? 0 },
    { label: 'Submissions', value: summary?.submissionsCount ?? 0 },
    { label: 'Graded', value: summary?.gradedSubmissions ?? 0 },
    {
      label: 'Average score',
      value: summary?.averagePercent === null || summary?.averagePercent === undefined
        ? '—'
        : `${summary.averagePercent}%`,
    },
  ];

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <Link href={`/teacher/courses/${courseId}`}>
          <Button variant="secondary" className="mb-6">
            ← Back to Course
          </Button>
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Course Analytics</h1>
          <p className="text-gray-600">
            Live enrollment, submission, and engagement data for this course.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {summaryCards.map((card) => (
            <div key={card.label} className="border rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{card.label}</p>
              <p className="text-2xl font-bold">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-bold mb-1">Recent activity</h2>
            <p className="text-sm text-gray-500 mb-4">Last {engagement?.days ?? 30} days</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded p-4">
                <p className="text-sm text-gray-500">New submissions</p>
                <p className="text-2xl font-bold">{engagement?.recentSubmissions ?? 0}</p>
              </div>
              <div className="bg-gray-50 rounded p-4">
                <p className="text-sm text-gray-500">New enrollments</p>
                <p className="text-2xl font-bold">{engagement?.recentEnrollments ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-bold mb-1">Grading progress</h2>
            <p className="text-sm text-gray-500 mb-4">
              {summary && summary.submissionsCount > 0
                ? `${summary.gradedSubmissions} of ${summary.submissionsCount} submissions graded`
                : 'No submissions to grade yet'}
            </p>
            <div className="h-3 bg-gray-100 rounded overflow-hidden mb-3">
              <div
                className="h-full bg-green-500"
                style={{
                  width:
                    summary && summary.submissionsCount > 0
                      ? `${Math.round((summary.gradedSubmissions / summary.submissionsCount) * 100)}%`
                      : '0%',
                }}
              />
            </div>
            <p className="text-sm text-gray-500">
              {summary?.averageGrade === null || summary?.averageGrade === undefined
                ? 'Average points: —'
                : `Average points: ${summary.averageGrade}`}
            </p>
          </div>
        </div>

        <section className="border rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Assignment performance</h2>
          {assignmentRows.length === 0 ? (
            <p className="text-gray-600">No assignments have been created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="py-2 pr-4 font-medium">Assignment</th>
                    <th className="py-2 pr-4 font-medium">Due</th>
                    <th className="py-2 pr-4 font-medium">Submissions</th>
                    <th className="py-2 font-medium">Average</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentRows.map((assignment) => {
                    const average = percentOf(assignment.averageGrade, assignment.maxPoints);
                    return (
                      <tr key={assignment.assignmentId} className="border-b last:border-b-0">
                        <td className="py-3 pr-4 font-medium">{assignment.assignmentTitle}</td>
                        <td className="py-3 pr-4 text-gray-500">
                          {new Date(assignment.dueDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {Number(assignment.submissionCount)} / {summary?.enrollmentCount ?? 0}
                        </td>
                        <td className="py-3">
                          {average === null ? (
                            <span className="text-gray-400">Not graded</span>
                          ) : (
                            <span className="font-medium">{average}%</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="border rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Student performance</h2>
          {students.length === 0 ? (
            <p className="text-gray-600">
              No submissions yet. Student averages appear here once work is submitted.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="py-2 pr-4 font-medium">Student</th>
                    <th className="py-2 pr-4 font-medium">Submissions</th>
                    <th className="py-2 pr-4 font-medium">Graded</th>
                    <th className="py-2 pr-4 font-medium">Average</th>
                    <th className="py-2 font-medium">Last submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} className="border-b last:border-b-0">
                      <td className="py-3 pr-4 font-medium">{student.name}</td>
                      <td className="py-3 pr-4 text-gray-500">{student.submissions}</td>
                      <td className="py-3 pr-4 text-gray-500">{student.graded}</td>
                      <td className="py-3 pr-4">
                        {student.averagePercent === null ? (
                          <span className="text-gray-400">Not graded</span>
                        ) : (
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                              student.averagePercent >= 70
                                ? 'bg-green-100 text-green-700'
                                : student.averagePercent >= 50
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {student.averagePercent}%
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-gray-500">
                        {new Date(student.lastSubmittedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
