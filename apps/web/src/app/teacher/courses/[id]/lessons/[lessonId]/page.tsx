'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Lesson {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  type: string;
  content: Record<string, unknown> | null;
  order: string;
  duration: string | null;
  isPublished: string;
  publishedAt: string | null;
}

interface Objective {
  id: string;
  courseId: string;
  description: string;
  order: number;
  createdAt: string;
}

interface LessonForm {
  title: string;
  description: string;
  type: string;
  content: string;
  order: string;
  duration: string;
  isPublished: string;
}

const LESSON_TYPES = ['text', 'video', 'document', 'interactive', 'quiz'];

export default function TeacherLessonEditorPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;
  const lessonId = params.lessonId as string;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [form, setForm] = useState<LessonForm>({
    title: '',
    description: '',
    type: 'text',
    content: '{}',
    order: '0',
    duration: '',
    isPublished: 'false',
  });
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const [newObjective, setNewObjective] = useState('');
  const [editingObjectiveId, setEditingObjectiveId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [objectiveBusyId, setObjectiveBusyId] = useState<string | null>(null);
  const [objectiveSaving, setObjectiveSaving] = useState(false);
  const [objectiveError, setObjectiveError] = useState('');
  const [objectiveMessage, setObjectiveMessage] = useState('');

  useEffect(() => {
    if (!user || !token || !courseId || !lessonId) return;

    const loadLesson = async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [lessonResponse, objectivesResponse, linkedResponse] = await Promise.all([
          fetch(apiUrl(`/api/content/lessons/${lessonId}`), { headers }),
          fetch(apiUrl(`/api/content/courses/${courseId}/objectives`), { headers }),
          fetch(apiUrl(`/api/content/lessons/${lessonId}/objectives`), { headers }),
        ]);

        if (!lessonResponse.ok) {
          const body = await lessonResponse.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load lesson');
        }
        if (!objectivesResponse.ok) {
          const body = await objectivesResponse.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load course objectives');
        }
        if (!linkedResponse.ok) {
          throw new Error('Failed to load lesson objectives');
        }

        const lessonData: Lesson = await lessonResponse.json();
        const courseObjectives: Objective[] = await objectivesResponse.json();
        const linkedObjectives: Objective[] = await linkedResponse.json();

        setLesson(lessonData);
        setForm({
          title: lessonData.title ?? '',
          description: lessonData.description ?? '',
          type: lessonData.type ?? 'text',
          content: JSON.stringify(lessonData.content ?? {}, null, 2),
          order: lessonData.order ?? '0',
          duration: lessonData.duration ?? '',
          isPublished: lessonData.isPublished === 'true' ? 'true' : 'false',
        });
        setObjectives(Array.isArray(courseObjectives) ? courseObjectives : []);
        setAttachedIds(
          Array.isArray(linkedObjectives)
            ? linkedObjectives.map((objective) => objective.id)
            : [],
        );
      } catch (err: any) {
        setError(err.message || 'Failed to load lesson');
      } finally {
        setLoading(false);
      }
    };

    void loadLesson();
  }, [user, token, courseId, lessonId, reloadKey]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;

    setSaveError('');
    setSaveMessage('');

    let parsedContent: unknown;
    try {
      parsedContent = form.content.trim() ? JSON.parse(form.content) : {};
    } catch {
      setSaveError('Content must be valid JSON.');
      return;
    }
    if (
      parsedContent === null ||
      typeof parsedContent !== 'object' ||
      Array.isArray(parsedContent)
    ) {
      setSaveError('Content must be a JSON object, for example {"text": "..."}.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/api/content/lessons/${lessonId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          type: form.type,
          content: parsedContent,
          order: form.order,
          duration: form.duration,
          isPublished: form.isPublished,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save lesson');
      }

      const updated: Lesson = await response.json();
      setLesson(updated);
      setForm({
        title: updated.title ?? '',
        description: updated.description ?? '',
        type: updated.type ?? 'text',
        content: JSON.stringify(updated.content ?? {}, null, 2),
        order: updated.order ?? '0',
        duration: updated.duration ?? '',
        isPublished: updated.isPublished === 'true' ? 'true' : 'false',
      });
      setSaveMessage('Lesson saved.');
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save lesson');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateObjective(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;

    const description = newObjective.trim();
    if (!description) {
      setObjectiveError('Enter an objective before adding it.');
      return;
    }

    setObjectiveSaving(true);
    setObjectiveError('');
    setObjectiveMessage('');
    try {
      const nextOrder =
        objectives.reduce((highest, objective) => Math.max(highest, objective.order), -1) + 1;
      const response = await fetch(apiUrl(`/api/content/courses/${courseId}/objectives`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ description, order: nextOrder }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to add objective');
      }

      const created: Objective = await response.json();
      setObjectives((current) => [...current, created]);
      setNewObjective('');
      setObjectiveMessage('Objective added. Link it to this lesson when ready.');
    } catch (err: any) {
      setObjectiveError(err.message || 'Failed to add objective');
    } finally {
      setObjectiveSaving(false);
    }
  }

  async function handleUpdateObjective(objectiveId: string) {
    if (!token) return;
    const description = editingDescription.trim();
    if (!description) {
      setObjectiveError('Objective description cannot be empty.');
      return;
    }

    setObjectiveSaving(true);
    setObjectiveError('');
    setObjectiveMessage('');
    try {
      const response = await fetch(apiUrl(`/api/content/objectives/${objectiveId}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ description }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update objective');
      }

      const updated: Objective = await response.json();
      setObjectives((current) =>
        current.map((objective) => (objective.id === updated.id ? updated : objective)),
      );
      setEditingObjectiveId(null);
      setEditingDescription('');
      setObjectiveMessage('Objective updated.');
    } catch (err: any) {
      setObjectiveError(err.message || 'Failed to update objective');
    } finally {
      setObjectiveSaving(false);
    }
  }

  async function handleDeleteObjective(objective: Objective) {
    if (!token) return;
    if (
      !window.confirm(
        'Delete this objective? It will be removed from every lesson that uses it.',
      )
    ) {
      return;
    }

    setObjectiveBusyId(objective.id);
    setObjectiveError('');
    setObjectiveMessage('');
    try {
      const response = await fetch(apiUrl(`/api/content/objectives/${objective.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete objective');
      }

      setObjectives((current) => current.filter((item) => item.id !== objective.id));
      setAttachedIds((current) => current.filter((id) => id !== objective.id));
      if (editingObjectiveId === objective.id) {
        setEditingObjectiveId(null);
        setEditingDescription('');
      }
      setObjectiveMessage('Objective deleted.');
    } catch (err: any) {
      setObjectiveError(err.message || 'Failed to delete objective');
    } finally {
      setObjectiveBusyId(null);
    }
  }

  async function handleToggleObjective(objectiveId: string, attached: boolean) {
    if (!token) return;
    setObjectiveBusyId(objectiveId);
    setObjectiveError('');
    setObjectiveMessage('');
    try {
      const response = await fetch(
        apiUrl(
          attached
            ? `/api/content/lessons/${lessonId}/objectives/${objectiveId}`
            : `/api/content/lessons/${lessonId}/objectives`,
        ),
        {
          method: attached ? 'DELETE' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: attached ? undefined : JSON.stringify({ objectiveId }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update lesson objectives');
      }

      setAttachedIds((current) =>
        attached
          ? current.filter((id) => id !== objectiveId)
          : [...current, objectiveId],
      );
      setObjectiveMessage(
        attached ? 'Objective unlinked from this lesson.' : 'Objective linked to this lesson.',
      );
    } catch (err: any) {
      setObjectiveError(err.message || 'Failed to update lesson objectives');
    } finally {
      setObjectiveBusyId(null);
    }
  }

  if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Teacher access required</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading lesson...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <div className="flex gap-3 justify-center">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError('');
                setReloadKey((current) => current + 1);
              }}
            >
              Try again
            </Button>
            <Link href={`/teacher/courses/${courseId}/lessons`}>
              <Button type="button" variant="secondary">
                Back to Lessons
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Lesson not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <Link href={`/teacher/courses/${courseId}/lessons`}>
            <Button variant="secondary">← Back to Lessons</Button>
          </Link>
          <Link href={`/teacher/courses/${courseId}`}>
            <Button variant="secondary">Course Overview</Button>
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold">Edit Lesson</h1>
          <p className="text-gray-600 mt-1">{lesson.title}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <form onSubmit={handleSave} className="lg:col-span-2 border rounded-lg p-8 space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Lesson Content</h2>
              <span
                className={`text-sm px-2 py-1 rounded ${
                  form.isPublished === 'true'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {form.isPublished === 'true' ? 'Published' : 'Draft'}
              </span>
            </div>

            {saveError && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {saveError}
              </div>
            )}
            {saveMessage && (
              <div role="status" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                {saveMessage}
              </div>
            )}

            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-2">
                Lesson Title *
              </label>
              <input
                type="text"
                id="title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                required
                maxLength={300}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={3}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of the lesson"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium mb-2">
                  Type *
                </label>
                <select
                  id="type"
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {LESSON_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="order" className="block text-sm font-medium mb-2">
                  Order *
                </label>
                <input
                  type="number"
                  id="order"
                  value={form.order}
                  onChange={(event) => setForm({ ...form, order: event.target.value })}
                  required
                  min="0"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="duration" className="block text-sm font-medium mb-2">
                  Duration
                </label>
                <input
                  type="text"
                  id="duration"
                  value={form.duration}
                  onChange={(event) => setForm({ ...form, duration: event.target.value })}
                  maxLength={50}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 30m, 1h"
                />
              </div>
            </div>

            <div>
              <label htmlFor="content" className="block text-sm font-medium mb-2">
                Content (JSON)
              </label>
              <textarea
                id="content"
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
                rows={10}
                spellCheck={false}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                aria-describedby="content-help"
              />
              <p id="content-help" className="text-xs text-gray-500 mt-1">
                Enter a JSON object, for example {'{"text": "Lesson content here..."}'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublished"
                checked={form.isPublished === 'true'}
                onChange={(event) =>
                  setForm({
                    ...form,
                    isPublished: event.target.checked ? 'true' : 'false',
                  })
                }
                className="w-4 h-4 text-blue-600"
              />
              <label htmlFor="isPublished" className="text-sm font-medium">
                Published
              </label>
            </div>

            <div className="flex gap-4">
              <Button type="submit" variant="primary" isLoading={saving} className="flex-1">
                Save Lesson
              </Button>
              <Link href={`/teacher/courses/${courseId}/lessons`} className="flex-1">
                <Button type="button" variant="secondary" className="w-full">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>

          <section className="border rounded-lg p-6" aria-labelledby="objectives-heading">
            <h2 id="objectives-heading" className="text-xl font-bold mb-1">
              Learning Objectives
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Objectives belong to the course. Link the ones this lesson teaches.
            </p>

            {objectiveError && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4 text-sm">
                {objectiveError}
              </div>
            )}
            {objectiveMessage && (
              <div role="status" className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded mb-4 text-sm">
                {objectiveMessage}
              </div>
            )}

            <form onSubmit={handleCreateObjective} className="space-y-2 mb-6">
              <label htmlFor="new-objective" className="block text-sm font-medium">
                Add an objective
              </label>
              <textarea
                id="new-objective"
                value={newObjective}
                onChange={(event) => setNewObjective(event.target.value)}
                rows={2}
                maxLength={1000}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Solve one-step linear equations"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={objectiveSaving && !editingObjectiveId}
                className="w-full"
              >
                Add Objective
              </Button>
            </form>

            {objectives.length === 0 ? (
              <div className="text-center py-8 border rounded-lg">
                <p className="text-gray-600 mb-1">No objectives yet</p>
                <p className="text-sm text-gray-500">
                  Add a course objective to start linking lessons.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {objectives.map((objective) => {
                  const attached = attachedIds.includes(objective.id);
                  const busy = objectiveBusyId === objective.id;
                  const editing = editingObjectiveId === objective.id;
                  return (
                    <li key={objective.id} className="border rounded-lg p-4">
                      {editing ? (
                        <div className="space-y-2">
                          <label
                            htmlFor={`objective-${objective.id}`}
                            className="block text-sm font-medium"
                          >
                            Objective description
                          </label>
                          <textarea
                            id={`objective-${objective.id}`}
                            value={editingDescription}
                            onChange={(event) => setEditingDescription(event.target.value)}
                            rows={2}
                            maxLength={1000}
                            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="primary"
                              isLoading={objectiveSaving}
                              onClick={() => void handleUpdateObjective(objective.id)}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingObjectiveId(null);
                                setEditingDescription('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-start gap-3">
                          <p className="font-medium break-words">{objective.description}</p>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                setEditingObjectiveId(objective.id);
                                setEditingDescription(objective.description);
                                setObjectiveError('');
                                setObjectiveMessage('');
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              isLoading={busy}
                              onClick={() => void handleDeleteObjective(objective)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`attach-${objective.id}`}
                          checked={attached}
                          disabled={busy}
                          onChange={() => void handleToggleObjective(objective.id, attached)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <label htmlFor={`attach-${objective.id}`} className="text-sm">
                          Linked to this lesson
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
