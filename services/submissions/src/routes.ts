import { Router } from 'express';
import { authorize, authenticate } from '@edunet/rbac';
import {
  createSubmissionHandler,
  autosaveHandler,
  historyHandler,
  getSubmissionHandler,
  listSubmissionsHandler,
  gradeSubmissionHandler,
  deleteSubmissionHandler,
  rubricHandler,
  getRubricHandler,
} from './handlers';

export function registerRoutes(app: any) {
  const router = Router();

  router.post('/', authenticate, authorize('student'), createSubmissionHandler);
  router.get('/', authenticate, listSubmissionsHandler);
  router.get('/:id', authenticate, getSubmissionHandler);
  // Autosave draft (students only, own submission).
  router.put('/:id/autosave', authenticate, authorize('student'), autosaveHandler);
  // Full history: content revisions, grade revisions and events.
  router.get('/:id/history', authenticate, historyHandler);
  router.put('/:id/grade', authenticate, authorize('teacher', 'admin'), gradeSubmissionHandler);
  router.delete('/:id', authenticate, authorize('student', 'admin'), deleteSubmissionHandler);

  // Rubric management (teacher/admin). Rubric must be complete to be valid.
  router.put(
    '/assignments/:assignmentId/rubric',
    authenticate,
    authorize('teacher', 'admin'),
    rubricHandler,
  );
  router.get('/assignments/:assignmentId/rubric', authenticate, getRubricHandler);

  app.use('/api/submissions', router);
}
