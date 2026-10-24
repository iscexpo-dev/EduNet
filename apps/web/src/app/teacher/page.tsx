'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';

interface Course {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade?: string;
  enrollmentCount?: number;
}

export default function TeacherDashboard() {
  const { user, token } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token || user.role !== 'teacher') return;

    const fetchCourses = async () => {
      try {
        const response = await fetch(
          apiUrl(`/api/courses?teacherId=${user.id}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch courses');
        }

        const data = await response.json();
        setCourses(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [user, token]);

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
        <p>Loading your courses...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-600">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
            <p className="text-gray-600 mt-2">Welcome, {user.firstName} {user.lastName}</p>
          </div>
          <div className="flex gap-4">
            <Link href="/teacher/courses/new">
              <Button variant="primary">Create Course</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary">Main Dashboard</Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Total Courses</h3>
            <p className="text-3xl font-bold">{courses.length}</p>
          </div>
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Total Students</h3>
            <p className="text-3xl font-bold">
              {courses.reduce((sum, c) => sum + (c.enrollmentCount || 0), 0)}
            </p>
          </div>
          <div className="border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-2">Pending Grading</h3>
            <p className="text-3xl font-bold">0</p>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-4">Your Courses</h2>

        {courses.length === 0 ? (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-gray-600 mb-4">You haven&apos;t created any courses yet</p>
            <Link href="/teacher/courses/new">
              <Button variant="primary">Create Your First Course</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <div key={course.id} className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
                <h2 className="text-xl font-semibold mb-2">{course.title}</h2>
                <p className="text-gray-600 mb-4 line-clamp-3">{course.description}</p>
                <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
                  <span>{course.subject}</span>
                  {course.grade && <span>Grade {course.grade}</span>}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    {course.enrollmentCount || 0} students enrolled
                  </span>
                  <Link href={`/teacher/courses/${course.id}`}>
                    <Button variant="primary" size="sm">
                      Manage
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
