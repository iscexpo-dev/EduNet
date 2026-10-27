import { Request, Response } from 'express';
import { findCourseById } from './db';
import {
  findLessonById,
  listLessonsByCourse,
  createLesson,
  updateLesson,
  deleteLesson,
  findLessonProgressById,
  findLessonProgress,
  listLessonProgressByStudent,
  createLessonProgress,
  updateLessonProgress,
  deleteLessonProgress,
  findResourceById,
  listResourcesByLesson,
  listResourcesByCourse,
  createResource,
  updateResource,
  deleteResource,
  listObjectivesByCourse,
  findObjectiveById,
  createObjective,
  updateObjective,
  deleteObjective,
  listObjectivesByLesson,
  attachObjective,
  detachObjective,
  listBookmarksByStudent,
  createBookmark,
  deleteBookmark,
  listNotesByStudent,
  findNote,
  upsertNote,
  deleteNote,
} from './db';
import {
  canManageCourse,
  canOwnPersonalState,
  isUuid,
  parseNoteContent,
  parseObjectiveInput,
  parseObjectiveUpdate,
} from './policy';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

// Lesson handlers
export async function createLessonHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { courseId, title, type, content, order } = req.body;

    if (!courseId || !title || !type || order === undefined) {
      return res.status(400).json({ error: 'courseId, title, type, and order are required' });
    }

    const course = await findCourseById(courseId, organizationId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    if (req.user?.role !== 'admin' && course.teacherId !== req.user?.id) {
      return res.status(403).json({ error: 'You can only add content to your own courses' });
    }

    const lesson = await createLesson({
      courseId,
      title,
      description: req.body.description,
      type,
      content,
      order,
      duration: req.body.duration,
      isPublished: req.body.isPublished || 'false',
    }, organizationId);

    res.status(201).json(lesson);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getLessonHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    const lesson = await findLessonById(id, organizationId);
    
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }
    
    res.json(lesson);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listLessonsHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { courseId } = req.query;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    
    if (!courseId || typeof courseId !== 'string') {
      return res.status(400).json({ error: 'courseId is required' });
    }
    
    const lessons = await listLessonsByCourse(courseId, organizationId, limit, offset);
    res.json(lessons);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateLessonHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    const data = req.body ?? {};

    const existing = await findLessonById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const course = await findCourseById(existing.courseId, organizationId);
    if (req.user?.role !== 'admin' && course?.teacherId !== req.user?.id) {
      return res.status(403).json({ error: 'You can only edit content for your own courses' });
    }

    const lesson = await updateLesson(id, organizationId, {
      title: data.title, description: data.description, type: data.type, content: data.content,
      order: data.order, duration: data.duration, isPublished: data.isPublished,
      publishedAt: data.isPublished === 'true' && !existing.publishedAt ? new Date() : undefined,
    });

    res.json(lesson);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteLessonHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;

    const existing = await findLessonById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const course = await findCourseById(existing.courseId, organizationId);
    if (req.user?.role !== 'admin' && course?.teacherId !== req.user?.id) {
      return res.status(403).json({ error: 'You can only delete content for your own courses' });
    }

    const lesson = await deleteLesson(id, organizationId);
    res.json(lesson);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Lesson Progress handlers
export async function createLessonProgressHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { lessonId, studentId, status, progress } = req.body;
    
    if (!lessonId || !studentId || !status) {
      return res.status(400).json({ error: 'lessonId, studentId, and status are required' });
    }

    if (req.user?.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Students can only track their own progress' });
    }

    const existing = await findLessonProgress(lessonId, studentId, organizationId);
    const values = {
      status,
      progress: progress || '0',
      timeSpent: req.body.timeSpent,
      lastAccessedAt: new Date(),
      completedAt: status === 'completed' ? new Date() : undefined,
    };
    const progressRecord = existing
      ? await updateLessonProgress(existing.id, organizationId, values)
      : await createLessonProgress({ lessonId, studentId, ...values }, organizationId);

    res.status(existing ? 200 : 201).json(progressRecord);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getLessonProgressHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    const progress = await findLessonProgressById(id, organizationId);
    
    if (!progress) {
      return res.status(404).json({ error: 'Lesson progress not found' });
    }

    if (req.user?.role === 'student' && progress.studentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only view your own progress' });
    }
    
    res.json(progress);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listLessonProgressHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { studentId } = req.query;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    if (!studentId || typeof studentId !== 'string') {
      return res.status(400).json({ error: 'studentId is required' });
    }

    if (req.user?.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'You can only view your own progress' });
    }
    
    const progressList = await listLessonProgressByStudent(studentId, organizationId, limit, offset);
    res.json(progressList);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateLessonProgressHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    const { status, progress, timeSpent } = req.body;
    
    const existing = await findLessonProgressById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Lesson progress not found' });
    }

    if (req.user?.role === 'student' && existing.studentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own progress' });
    }

    const progressRecord = await updateLessonProgress(id, organizationId, {
      status,
      progress,
      timeSpent,
      completedAt: status === 'completed' && !existing.completedAt ? new Date() : undefined,
      lastAccessedAt: new Date(),
    });
    
    res.json(progressRecord);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteLessonProgressHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    
    const existing = await findLessonProgressById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Lesson progress not found' });
    }

    if (req.user?.role === 'student' && existing.studentId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own progress' });
    }

    const progressRecord = await deleteLessonProgress(id, organizationId);
    res.json(progressRecord);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Resource handlers
export async function createResourceHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { title, type, url, courseId } = req.body;

    if (!title || !type || !url) {
      return res.status(400).json({ error: 'title, type, and url are required' });
    }

    if (courseId) {
      const course = await findCourseById(courseId, organizationId);
      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }
      if (req.user?.role !== 'admin' && course.teacherId !== req.user?.id) {
        return res.status(403).json({ error: 'You can only add resources to your own courses' });
      }
    }

    const resource = await createResource({
      lessonId: req.body.lessonId,
      courseId: req.body.courseId,
      title,
      type,
      url,
      size: req.body.size,
      mimeType: req.body.mimeType,
      description: req.body.description,
      order: req.body.order,
      isDownloadable: req.body.isDownloadable || 'true',
    }, organizationId);

    res.status(201).json(resource);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function getResourceHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    const resource = await findResourceById(id, organizationId);
    
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    res.json(resource);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listResourcesHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { lessonId, courseId } = req.query;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    let resources;
    if (lessonId && typeof lessonId === 'string') {
      resources = await listResourcesByLesson(lessonId, organizationId, limit, offset);
    } else if (courseId && typeof courseId === 'string') {
      resources = await listResourcesByCourse(courseId, organizationId, limit, offset);
    } else {
      return res.status(400).json({ error: 'lessonId or courseId is required' });
    }
    
    res.json(resources);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function updateResourceHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    const input = req.body ?? {};

    const existing = await findResourceById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    if (existing.courseId) {
      const course = await findCourseById(existing.courseId, organizationId);
      if (req.user?.role !== 'admin' && course?.teacherId !== req.user?.id) {
        return res.status(403).json({ error: 'You can only edit resources for your own courses' });
      }
    }

    const resource = await updateResource(id, organizationId, {
      title: input.title, type: input.type, url: input.url, size: input.size,
      mimeType: input.mimeType, description: input.description, order: input.order,
      isDownloadable: input.isDownloadable,
    });
    res.json(resource);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteResourceHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;

    const existing = await findResourceById(id, organizationId);
    if (!existing) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    if (existing.courseId) {
      const course = await findCourseById(existing.courseId, organizationId);
      if (req.user?.role !== 'admin' && course?.teacherId !== req.user?.id) {
        return res.status(403).json({ error: 'You can only delete resources for your own courses' });
      }
    }

    const resource = await deleteResource(id, organizationId);
    res.json(resource);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Learning objective handlers
export async function listCourseObjectivesHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { courseId } = req.params;
    if (!isUuid(courseId)) return res.status(400).json({ error: 'Invalid course id' });

    const course = await findCourseById(courseId, organizationId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    res.json(await listObjectivesByCourse(courseId, organizationId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function createCourseObjectiveHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { courseId } = req.params;
    if (!isUuid(courseId)) return res.status(400).json({ error: 'Invalid course id' });

    const course = await findCourseById(courseId, organizationId);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (!canManageCourse(req.user?.role, req.user?.id, course.teacherId)) {
      return res.status(403).json({ error: 'You can only edit your own courses' });
    }

    const input = parseObjectiveInput(req.body);
    const objective = await createObjective({ courseId, ...input }, organizationId);
    res.status(201).json(objective);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function updateObjectiveHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid objective id' });

    const existing = await findObjectiveById(id, organizationId);
    if (!existing) return res.status(404).json({ error: 'Objective not found' });

    const course = await findCourseById(existing.courseId, organizationId);
    if (!canManageCourse(req.user?.role, req.user?.id, course?.teacherId)) {
      return res.status(403).json({ error: 'You can only edit your own courses' });
    }

    const patch = parseObjectiveUpdate(req.body);
    res.json(await updateObjective(id, organizationId, patch));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function deleteObjectiveHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid objective id' });

    const existing = await findObjectiveById(id, organizationId);
    if (!existing) return res.status(404).json({ error: 'Objective not found' });

    const course = await findCourseById(existing.courseId, organizationId);
    if (!canManageCourse(req.user?.role, req.user?.id, course?.teacherId)) {
      return res.status(403).json({ error: 'You can only delete objectives for your own courses' });
    }

    res.json(await deleteObjective(id, organizationId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function listLessonObjectivesHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { lessonId } = req.params;
    if (!isUuid(lessonId)) return res.status(400).json({ error: 'Invalid lesson id' });

    const lesson = await findLessonById(lessonId, organizationId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    res.json(await listObjectivesByLesson(lessonId, organizationId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function attachLessonObjectiveHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { lessonId } = req.params;
    if (!isUuid(lessonId)) return res.status(400).json({ error: 'Invalid lesson id' });

    const objectiveId =
      typeof req.body?.objectiveId === 'string' ? req.body.objectiveId.trim() : '';
    if (!isUuid(objectiveId)) {
      return res.status(400).json({ error: 'objectiveId must be a valid id' });
    }

    const lesson = await findLessonById(lessonId, organizationId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const course = await findCourseById(lesson.courseId, organizationId);
    if (!canManageCourse(req.user?.role, req.user?.id, course?.teacherId)) {
      return res.status(403).json({ error: 'You can only edit your own courses' });
    }

    const link = await attachObjective(lessonId, objectiveId, organizationId);
    res.status(201).json(link);
  } catch (error: any) {
    const notFound = /not found/i.test(error.message);
    res.status(notFound ? 404 : 400).json({ error: error.message });
  }
}

export async function detachLessonObjectiveHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId) return res.status(403).json({ error: 'Organization context required' });
  try {
    const { lessonId, objectiveId } = req.params;
    if (!isUuid(lessonId) || !isUuid(objectiveId)) {
      return res.status(400).json({ error: 'Invalid lesson or objective id' });
    }

    const lesson = await findLessonById(lessonId, organizationId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const course = await findCourseById(lesson.courseId, organizationId);
    if (!canManageCourse(req.user?.role, req.user?.id, course?.teacherId)) {
      return res.status(403).json({ error: 'You can only edit your own courses' });
    }

    const link = await detachObjective(lessonId, objectiveId, organizationId);
    if (!link) return res.status(404).json({ error: 'Objective is not attached to this lesson' });
    res.json(link);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Bookmark handlers. Every query is scoped to the caller and their organization.
export async function listBookmarksHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  if (!canOwnPersonalState(req.user.role)) {
    return res.status(403).json({ error: 'Only students have lesson bookmarks' });
  }
  try {
    res.json(await listBookmarksByStudent(req.user.id, organizationId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function createBookmarkHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  if (!canOwnPersonalState(req.user.role)) {
    return res.status(403).json({ error: 'Only students have lesson bookmarks' });
  }
  try {
    const lessonId = typeof req.body?.lessonId === 'string' ? req.body.lessonId.trim() : '';
    if (!isUuid(lessonId)) return res.status(400).json({ error: 'lessonId must be a valid id' });

    const bookmark = await createBookmark(lessonId, req.user.id, organizationId);
    res.status(201).json(bookmark);
  } catch (error: any) {
    const notFound = /not found/i.test(error.message);
    res.status(notFound ? 404 : 400).json({ error: error.message });
  }
}

export async function deleteBookmarkHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  if (!canOwnPersonalState(req.user.role)) {
    return res.status(403).json({ error: 'Only students have lesson bookmarks' });
  }
  try {
    const { lessonId } = req.params;
    if (!isUuid(lessonId)) return res.status(400).json({ error: 'Invalid lesson id' });

    const bookmark = await deleteBookmark(lessonId, req.user.id, organizationId);
    if (!bookmark) return res.status(404).json({ error: 'Bookmark not found' });
    res.json(bookmark);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// Note handlers. Notes are private to the student who wrote them.
export async function listNotesHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  if (!canOwnPersonalState(req.user.role)) {
    return res.status(403).json({ error: 'Only students have lesson notes' });
  }
  try {
    res.json(await listNotesByStudent(req.user.id, organizationId));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function getLessonNoteHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  if (!canOwnPersonalState(req.user.role)) {
    return res.status(403).json({ error: 'Only students have lesson notes' });
  }
  try {
    const { lessonId } = req.params;
    if (!isUuid(lessonId)) return res.status(400).json({ error: 'Invalid lesson id' });

    const lesson = await findLessonById(lessonId, organizationId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    res.json((await findNote(lessonId, req.user.id, organizationId)) ?? null);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function upsertLessonNoteHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  if (!canOwnPersonalState(req.user.role)) {
    return res.status(403).json({ error: 'Only students have lesson notes' });
  }
  try {
    const { lessonId } = req.params;
    if (!isUuid(lessonId)) return res.status(400).json({ error: 'Invalid lesson id' });

    const content = parseNoteContent(req.body);
    const note = await upsertNote(lessonId, req.user.id, organizationId, content);
    res.json(note);
  } catch (error: any) {
    const notFound = /not found/i.test(error.message);
    res.status(notFound ? 404 : 400).json({ error: error.message });
  }
}

export async function deleteLessonNoteHandler(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    return res.status(403).json({ error: 'Organization context required' });
  }
  if (!canOwnPersonalState(req.user.role)) {
    return res.status(403).json({ error: 'Only students have lesson notes' });
  }
  try {
    const { lessonId } = req.params;
    if (!isUuid(lessonId)) return res.status(400).json({ error: 'Invalid lesson id' });

    const note = await deleteNote(lessonId, req.user.id, organizationId);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
