import { Router } from 'express';
import { authorize, authenticate } from '@edunet/rbac';
import {
  createLessonHandler,
  getLessonHandler,
  listLessonsHandler,
  updateLessonHandler,
  deleteLessonHandler,
  createLessonProgressHandler,
  getLessonProgressHandler,
  listLessonProgressHandler,
  updateLessonProgressHandler,
  deleteLessonProgressHandler,
  createResourceHandler,
  getResourceHandler,
  listResourcesHandler,
  updateResourceHandler,
  deleteResourceHandler,
  listCourseObjectivesHandler,
  createCourseObjectiveHandler,
  updateObjectiveHandler,
  deleteObjectiveHandler,
  listLessonObjectivesHandler,
  attachLessonObjectiveHandler,
  detachLessonObjectiveHandler,
  listBookmarksHandler,
  createBookmarkHandler,
  deleteBookmarkHandler,
  listNotesHandler,
  getLessonNoteHandler,
  upsertLessonNoteHandler,
  deleteLessonNoteHandler,
} from './handlers';
import {
  uploadMediaHandler,
  listMediaHandler,
  getMediaAccessHandler,
  deleteMediaHandler,
} from './media-handlers';
import { getStorage, verifySignedUrl, StorageError } from './storage';


export function registerRoutes(app: any) {
  const router = Router();

  // Lesson routes
  router.post('/lessons', authenticate, authorize('teacher', 'admin'), createLessonHandler);
  router.get('/lessons', authenticate, listLessonsHandler);
  router.get('/lessons/:id', authenticate, getLessonHandler);
  router.put('/lessons/:id', authenticate, authorize('teacher', 'admin'), updateLessonHandler);
  router.delete('/lessons/:id', authenticate, authorize('teacher', 'admin'), deleteLessonHandler);

  // Lesson Progress routes
  router.post('/lesson-progress', authenticate, createLessonProgressHandler);
  router.get('/lesson-progress', authenticate, listLessonProgressHandler);
  router.get('/lesson-progress/:id', authenticate, getLessonProgressHandler);
  router.put('/lesson-progress/:id', authenticate, updateLessonProgressHandler);
  router.delete('/lesson-progress/:id', authenticate, deleteLessonProgressHandler);

  // Resource routes
  router.post('/resources', authenticate, authorize('teacher', 'admin'), createResourceHandler);
  router.get('/resources', authenticate, listResourcesHandler);
  router.get('/resources/:id', authenticate, getResourceHandler);
  router.put('/resources/:id', authenticate, authorize('teacher', 'admin'), updateResourceHandler);
  router.delete('/resources/:id', authenticate, authorize('teacher', 'admin'), deleteResourceHandler);

  // Learning objectives. Reading is open to authenticated members of the
  // organization; mutations are limited to the owning teacher or an admin
  // (enforced again in each handler).
  router.get('/courses/:courseId/objectives', authenticate, listCourseObjectivesHandler);
  router.post('/courses/:courseId/objectives', authenticate, authorize('teacher', 'admin'), createCourseObjectiveHandler);
  router.put('/objectives/:id', authenticate, authorize('teacher', 'admin'), updateObjectiveHandler);
  router.delete('/objectives/:id', authenticate, authorize('teacher', 'admin'), deleteObjectiveHandler);
  router.get('/lessons/:lessonId/objectives', authenticate, listLessonObjectivesHandler);
  router.post('/lessons/:lessonId/objectives', authenticate, authorize('teacher', 'admin'), attachLessonObjectiveHandler);
  router.delete('/lessons/:lessonId/objectives/:objectiveId', authenticate, authorize('teacher', 'admin'), detachLessonObjectiveHandler);

  // Personal learning state. Handlers pin every row to the caller's id, so a
  // forged body cannot read or mutate another student's data.
  router.get('/bookmarks', authenticate, authorize('student'), listBookmarksHandler);
  router.post('/bookmarks', authenticate, authorize('student'), createBookmarkHandler);
  router.delete('/bookmarks/:lessonId', authenticate, authorize('student'), deleteBookmarkHandler);

  router.get('/notes', authenticate, authorize('student'), listNotesHandler);
  router.get('/lessons/:lessonId/note', authenticate, authorize('student'), getLessonNoteHandler);
  router.put('/lessons/:lessonId/note', authenticate, authorize('student'), upsertLessonNoteHandler);
  router.delete('/lessons/:lessonId/note', authenticate, authorize('student'), deleteLessonNoteHandler);

  // Media routes. Uploads are teacher/admin owned; access URLs are signed.
  router.post('/media', authenticate, authorize('teacher', 'admin'), uploadMediaHandler);
  router.get('/media', authenticate, listMediaHandler);
  router.get('/media/:id/access', authenticate, getMediaAccessHandler);
  router.delete('/media/:id', authenticate, authorize('teacher', 'admin'), deleteMediaHandler);

  // Signed object delivery. Access is granted by signature + expiry only,
  // because this URL is handed to a browser that may not send a bearer token.
  router.get('/files/*', async (req: any, res: any) => {
    const key = decodeURIComponent(String(req.params[0] ?? ''));
    const expires = Number(req.query.expires);
    const signature = String(req.query.signature ?? '');

    const verdict = (() => {
      try {
        return verifySignedUrl(key, expires, signature);
      } catch {
        return { valid: false as const, reason: 'BAD_SIGNATURE' as const };
      }
    })();

    if (!verdict.valid) {
      return res.status(403).json({
        error: verdict.reason === 'EXPIRED' ? 'Link has expired' : 'Invalid link',
      });
    }

    try {
      const body = await getStorage().get(key);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.send(body);
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND') {
        return res.status(404).json({ error: 'File not found' });
      }
      return res.status(500).json({ error: 'Unable to read file' });
    }
  });

  app.use('/api/content', router);
}
