'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Assignment { id: string; title: string; maxPoints: number; dueDate: string }
interface Submission { id: string; content: string; submittedAt: string; grade: number | null; feedback: string | null; studentId: string }

export default function GradeAssignmentsPage() {
  const { token } = useAuth();
  const { id: courseId, assignmentId } = useParams<{ id: string; assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [grades, setGrades] = useState<Record<string, { grade: string; feedback: string }>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [assignmentResponse, submissionResponse] = await Promise.all([
          fetch(apiUrl(`/api/assignments/${assignmentId}`), { headers }),
          fetch(apiUrl(`/api/submissions?assignmentId=${assignmentId}`), { headers }),
        ]);
        const assignmentData = await assignmentResponse.json();
        const submissionData = await submissionResponse.json();
        if (!assignmentResponse.ok) throw new Error(assignmentData.error || 'Could not load assignment');
        if (!submissionResponse.ok) throw new Error(submissionData.error || 'Could not load submissions');
        if (cancelled) return;
        setAssignment(assignmentData);
        setSubmissions(submissionData);
        setGrades(Object.fromEntries(submissionData.map((submission: Submission) => [submission.id, { grade: submission.grade == null ? '' : String(submission.grade), feedback: submission.feedback || '' }])));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load submissions');
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [token, assignmentId]);

  async function saveGrade(event: FormEvent<HTMLFormElement>, submissionId: string) {
    event.preventDefault();
    if (!token) return;
    setSavingId(submissionId);
    setError('');
    try {
      const value = grades[submissionId];
      const response = await fetch(apiUrl(`/api/submissions/${submissionId}/grade`), {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ grade: Number(value.grade), feedback: value.feedback }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save grade');
      setSubmissions(current => current.map(item => item.id === submissionId ? data : item));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save grade'); }
    finally { setSavingId(''); }
  }

  return <main className="min-h-screen p-8"><section className="mx-auto max-w-4xl">
    <Link href={`/teacher/courses/${courseId}`} className="mb-6 inline-block text-blue-700">← Back to course</Link>
    {loading ? <p>Loading submissions…</p> : error && !assignment ? <p role="alert" className="text-red-700">{error}</p> : assignment && <>
      <h1 className="mb-2 text-3xl font-bold">{assignment.title}: submissions</h1>
      <p className="mb-6 text-gray-600">Due {new Date(assignment.dueDate).toLocaleString()} · {assignment.maxPoints} points</p>
      {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
      {submissions.length === 0 ? <p>No submissions yet.</p> : <div className="space-y-6">{submissions.map(submission => <article key={submission.id} className="rounded-lg border p-6">
        <h2 className="mb-2 font-semibold">Student submission</h2>
        <p className="mb-4 text-sm text-gray-500">Submitted {new Date(submission.submittedAt).toLocaleString()}</p>
        <p className="mb-5 whitespace-pre-wrap rounded bg-gray-50 p-4">{submission.content}</p>
        <form onSubmit={event => void saveGrade(event, submission.id)} className="grid gap-4 md:grid-cols-[10rem_1fr_auto] md:items-end">
          <div><label htmlFor={`grade-${submission.id}`} className="mb-1 block font-medium">Grade / {assignment.maxPoints}</label><input id={`grade-${submission.id}`} type="number" min="0" max={assignment.maxPoints} step="1" required value={grades[submission.id]?.grade ?? ''} onChange={event => setGrades(current => ({ ...current, [submission.id]: { ...current[submission.id], grade: event.target.value } }))} className="w-full rounded border p-2" /></div>
          <div><label htmlFor={`feedback-${submission.id}`} className="mb-1 block font-medium">Feedback</label><textarea id={`feedback-${submission.id}`} maxLength={5000} rows={2} value={grades[submission.id]?.feedback ?? ''} onChange={event => setGrades(current => ({ ...current, [submission.id]: { ...current[submission.id], feedback: event.target.value } }))} className="w-full rounded border p-2" /></div>
          <Button type="submit" variant="primary" isLoading={savingId === submission.id}>Save grade</Button>
        </form>
      </article>)}</div>}
    </>}
  </section></main>;
}
