'use client';

import { apiUrl } from '@/lib/api-url';

import { useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';

export default function NewLessonPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'text',
    content: '',
    order: '0',
    duration: '',
    isPublished: 'false',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !token) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(apiUrl('/api/content/lessons'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          courseId,
          content: JSON.parse(formData.content || '{}'),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create lesson');
      }

      const data = await response.json();
      router.push(`/teacher/courses/${courseId}/lessons`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role !== 'teacher') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Teacher access required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <Link href={`/teacher/courses/${courseId}/lessons`}>
          <Button variant="secondary" className="mb-6">
            ← Back to Lessons
          </Button>
        </Link>

        <div className="border rounded-lg p-8">
          <h1 className="text-3xl font-bold mb-6">Create New Lesson</h1>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-2">
                Lesson Title *
              </label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Introduction to Algebra"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of the lesson"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium mb-2">
                  Type *
                </label>
                <select
                  id="type"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="text">Text</option>
                  <option value="video">Video</option>
                  <option value="document">Document</option>
                  <option value="interactive">Interactive</option>
                  <option value="quiz">Quiz</option>
                </select>
              </div>

              <div>
                <label htmlFor="order" className="block text-sm font-medium mb-2">
                  Order *
                </label>
                <input
                  type="number"
                  id="order"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: e.target.value })}
                  required
                  min="0"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label htmlFor="duration" className="block text-sm font-medium mb-2">
                Duration (Optional)
              </label>
              <input
                type="text"
                id="duration"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 30m, 1h"
              />
            </div>

            <div>
              <label htmlFor="content" className="block text-sm font-medium mb-2">
                Content (JSON)
              </label>
              <textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                rows={6}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder='{"text": "Lesson content here..."}'
              />
              <p className="text-xs text-gray-500 mt-1">Enter content as JSON object</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublished"
                checked={formData.isPublished === 'true'}
                onChange={(e) =>
                  setFormData({ ...formData, isPublished: e.target.checked ? 'true' : 'false' })
                }
                className="w-4 h-4 text-blue-600"
              />
              <label htmlFor="isPublished" className="text-sm font-medium">
                Publish immediately
              </label>
            </div>

            <div className="flex gap-4">
              <Button type="submit" variant="primary" isLoading={loading} className="flex-1">
                Create Lesson
              </Button>
              <Link href={`/teacher/courses/${courseId}/lessons`} className="flex-1">
                <Button type="button" variant="secondary" className="w-full">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
