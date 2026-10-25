'use client';

import { apiUrl } from '@/lib/api-url';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import { useParams, useRouter } from 'next/navigation';

export default function NewAssignmentPage() {
  const { token } = useAuth();
  const { id: courseId } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [maxPoints, setMaxPoints] = useState('100');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(apiUrl('/api/assignments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          courseId,
          title,
          description,
          dueDate: new Date(dueDate).toISOString(),
          maxPoints: Number(maxPoints),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create assignment');
      router.push(`/teacher/courses/${courseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create assignment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen p-8">
      <section className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-3xl font-bold">Create assignment</h1>
        <form onSubmit={submit} className="space-y-5 rounded-lg border p-6">
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="assignment-title" className="mb-1 block font-medium">
              Title
            </label>
            <input
              id="assignment-title"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border p-2"
            />
          </div>
          <div>
            <label htmlFor="assignment-description" className="mb-1 block font-medium">
              Instructions
            </label>
            <textarea
              id="assignment-description"
              required
              maxLength={5000}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border p-2"
            />
          </div>
          <div>
            <label htmlFor="assignment-due-date" className="mb-1 block font-medium">
              Due date
            </label>
            <input
              id="assignment-due-date"
              type="datetime-local"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded border p-2"
            />
          </div>
          <div>
            <label htmlFor="assignment-max-points" className="mb-1 block font-medium">
              Maximum points
            </label>
            <input
              id="assignment-max-points"
              type="number"
              min="0"
              max="100000"
              step="1"
              required
              value={maxPoints}
              onChange={(e) => setMaxPoints(e.target.value)}
              className="rounded border p-2"
            />
          </div>
          <Button type="submit" variant="primary" isLoading={saving}>
            Create assignment
          </Button>
        </form>
      </section>
    </main>
  );
}
