'use client';

import { apiUrl } from '@/lib/api-url';

import { useEffect, useState } from 'react';
import { useAuth } from '@edunet/auth';
import { Button } from '@edunet/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Lesson {
  id: string;
  title: string;
  description: string;
  type: string;
  order: string;
  duration?: string;
  content: any;
}

interface LessonProgress {
  id: string;
  lessonId: string;
  studentId: string;
  status: string;
  progress: string;
  timeSpent?: string;
  completedAt?: string;
}

export default function CourseLearningPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const courseId = params.id as string;
  
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<LessonProgress[]>([]);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progressError, setProgressError] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);

  useEffect(() => {
    if (!user || !token || !courseId) return;

    const fetchData = async () => {
      try {
        const lessonsResponse = await fetch(
          apiUrl(`/api/content/lessons?courseId=${courseId}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (lessonsResponse.ok) {
          const lessonsData = await lessonsResponse.json();
          setLessons(lessonsData);
          
          if (lessonsData.length > 0) {
            setCurrentLesson(lessonsData[0]);
          }
        }

        const progressResponse = await fetch(
          apiUrl(`/api/content/lesson-progress?studentId=${user.id}`),
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          setProgress(progressData);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, token, courseId]);

  const getProgressForLesson = (lessonId: string) => {
    return progress.find(p => p.lessonId === lessonId);
  };

  const handleLessonClick = (lesson: Lesson) => {
    setCurrentLesson(lesson);
  };

  const handleCompleteLesson = async () => {
    if (!user || !token || !currentLesson) return;
    setSavingProgress(true);
    setProgressError('');
    try {
      const response = await fetch(apiUrl('/api/content/lesson-progress'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lessonId: currentLesson.id,
          studentId: user.id,
          status: 'completed',
          progress: '100',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update lesson progress');
      setProgress((current) => [
        ...current.filter((item) => item.lessonId !== currentLesson.id),
        result,
      ]);
    } catch (err: any) {
      setProgressError(err.message);
    } finally {
      setSavingProgress(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Please log in to view course content</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading course content...</p>
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

  const completedCount = progress.filter(p => p.status === 'completed').length;
  const progressPercentage = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <Link href={`/my-courses/${courseId}`}>
          <Button variant="secondary" className="mb-6">
            ← Back to Course
          </Button>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="border rounded-lg p-6 sticky top-8">
              <h2 className="text-lg font-bold mb-4">Course Progress</h2>
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Completed</span>
                  <span>{progressPercentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all" 
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              <h3 className="text-md font-semibold mb-3">Lessons</h3>
              <div className="space-y-2">
                {lessons.map((lesson, index) => {
                  const lessonProgress = getProgressForLesson(lesson.id);
                  const isCompleted = lessonProgress?.status === 'completed';
                  const isInProgress = lessonProgress?.status === 'in_progress';

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => handleLessonClick(lesson)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        currentLesson?.id === lesson.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                          isCompleted 
                            ? 'bg-green-100 text-green-700' 
                            : isInProgress
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {isCompleted ? '✓' : index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{lesson.title}</p>
                          <p className="text-xs text-gray-500">
                            {lesson.type} {lesson.duration && `• ${lesson.duration}`}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            {currentLesson ? (
              <div className="border rounded-lg p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h1 className="text-2xl font-bold mb-2">{currentLesson.title}</h1>
                    <p className="text-gray-600">{currentLesson.description}</p>
                  </div>
                  {currentLesson.duration && (
                    <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded">
                      {currentLesson.duration}
                    </span>
                  )}
                </div>

                <div className="border-t pt-6">
                  {currentLesson.type === 'text' && (
                    <div className="prose max-w-none">
                      <p className="text-gray-700 whitespace-pre-wrap">
                        {currentLesson.content?.text || 'No content available'}
                      </p>
                    </div>
                  )}

                  {currentLesson.type === 'video' && (
                    <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                      <p className="text-gray-500">Video player placeholder</p>
                    </div>
                  )}

                  {currentLesson.type === 'document' && (
                    <div className="bg-gray-50 p-6 rounded-lg">
                      <p className="text-gray-700">Document content would be displayed here</p>
                    </div>
                  )}

                  {currentLesson.type === 'quiz' && (
                    <div className="bg-blue-50 p-6 rounded-lg">
                      <p className="text-blue-700">Quiz content would be displayed here</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center mt-8 pt-6 border-t">
                  <Button 
                    variant="secondary" 
                    disabled={lessons.indexOf(currentLesson) === 0}
                    onClick={() => {
                      const currentIndex = lessons.indexOf(currentLesson);
                      if (currentIndex > 0) {
                        setCurrentLesson(lessons[currentIndex - 1]);
                      }
                    }}
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="primary"
                    disabled={lessons.indexOf(currentLesson) === lessons.length - 1}
                    onClick={() => {
                      const currentIndex = lessons.indexOf(currentLesson);
                      if (currentIndex < lessons.length - 1) {
                        setCurrentLesson(lessons[currentIndex + 1]);
                      }
                    }}
                  >
                    Next
                  </Button>
                </div>
                <div className="mt-6 border-t pt-6">
                  {progressError && <p role="alert" className="mb-3 text-sm text-red-600">{progressError}</p>}
                  {user.role === 'student' && (
                    <Button
                      variant={getProgressForLesson(currentLesson.id)?.status === 'completed' ? 'secondary' : 'primary'}
                      isLoading={savingProgress}
                      disabled={getProgressForLesson(currentLesson.id)?.status === 'completed'}
                      onClick={handleCompleteLesson}
                    >
                      {getProgressForLesson(currentLesson.id)?.status === 'completed' ? 'Lesson completed' : 'Mark lesson complete'}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center">
                <p className="text-gray-600">No lessons available in this course</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
