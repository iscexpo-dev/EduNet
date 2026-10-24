'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Course {
  id: string;
  title: string;
  description: string;
  subject: string;
  grade?: string;
  teacherId: string;
  organizationId: string;
  enrollmentCount?: number;
}

interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  enrolledAt: string;
  status: string;
}

export default function CourseDetailPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;
  
  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token || !courseId) return;

    const fetchCourseAndEnrollment = async () => {
      try {
        const courseResponse = await fetch(
          apiUrl(`/api/courses/${courseId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!courseResponse.ok) {
          throw new Error('Failed to fetch course');
        }

        const courseData = await courseResponse.json();
        setCourse(courseData);

        const enrollmentResponse = await fetch(
          apiUrl(`/api/enrollments?studentId=${user.id}&courseId=${courseId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (enrollmentResponse.ok) {
          const enrollmentData = await enrollmentResponse.json();
          if (enrollmentData.length > 0) {
            setEnrollment(enrollmentData[0]);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCourseAndEnrollment();
  }, [user, token, courseId]);

  const handleEnroll = async () => {
    if (!user || !token) return;

    setEnrolling(true);
    try {
      const response = await fetch(apiUrl('/api/enrollments'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentId: user.id,
          courseId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to enroll');
      }

      const data = await response.json();
      setEnrollment(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnrolling(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view course details</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading course...</p>
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

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Course not found</p>
      </div>
    );
  }

  const isEnrolled = enrollment !== null;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/courses">
          <Button variant="secondary" className="mb-6">
            ← Back to Courses
          </Button>
        </Link>

        <div className="border rounded-lg p-8">
          <h1 className="text-3xl font-bold mb-4">{course.title}</h1>
          
          <div className="flex gap-4 mb-6 text-sm text-gray-500">
            <span>{course.subject}</span>
            {course.grade && <span>Grade {course.grade}</span>}
            <span>{course.enrollmentCount || 0} students enrolled</span>
          </div>

          <p className="text-gray-700 mb-8">{course.description}</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {isEnrolled ? (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
              <p className="font-semibold">You are enrolled in this course</p>
              <p className="text-sm">Status: {enrollment.status}</p>
              <Link href={`/my-courses/${courseId}`}>
                <Button variant="primary" className="mt-4">
                  Go to Course
                </Button>
              </Link>
            </div>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              isLoading={enrolling}
              onClick={handleEnroll}
            >
              Enroll in Course
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
