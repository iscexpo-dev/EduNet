import { Router } from 'express';
import { authorize, authenticate } from '@edunet/rbac';
import {
  createQuizHandler,
  getQuizHandler,
  listQuizzesHandler,
  updateQuizHandler,
  deleteQuizHandler,
  createQuestionHandler,
  getQuestionHandler,
  listQuestionsHandler,
  updateQuestionHandler,
  deleteQuestionHandler,
  createQuizAttemptHandler,
  getQuizAttemptHandler,
  listQuizAttemptsHandler,
  submitQuizAttemptHandler,
  deleteQuizAttemptHandler,
} from './handlers';
import {
  createBankHandler,
  listBankHandler,
  listBankQuestionsHandler,
  updateBankHandler,
  attachQuestionsHandler,
  presentationHandler,
  manualGradeHandler,
  gradeHistoryHandler,
  createRecheckHandler,
  listRecheckHandler,
  decideRecheckHandler,
} from './expansion-handlers';

export function registerRoutes(app: any) {
  const router = Router();

  // Quiz routes
  router.post('/quizzes', authenticate, authorize('teacher', 'admin'), createQuizHandler);
  router.get('/quizzes', authenticate, listQuizzesHandler);
  router.get('/quizzes/:id', authenticate, getQuizHandler);
  router.put('/quizzes/:id', authenticate, authorize('teacher', 'admin'), updateQuizHandler);
  router.delete('/quizzes/:id', authenticate, authorize('teacher', 'admin'), deleteQuizHandler);

  // Question routes
  router.post('/questions', authenticate, authorize('teacher', 'admin'), createQuestionHandler);
  router.get('/questions', authenticate, listQuestionsHandler);
  router.get('/questions/:id', authenticate, getQuestionHandler);
  router.put('/questions/:id', authenticate, authorize('teacher', 'admin'), updateQuestionHandler);
  router.delete('/questions/:id', authenticate, authorize('teacher', 'admin'), deleteQuestionHandler);

  // Question bank routes
  router.post('/question-banks', authenticate, authorize('teacher', 'admin'), createBankHandler);
  router.get('/question-banks', authenticate, authorize('teacher', 'admin'), listBankHandler);
  router.get('/question-banks/:id/questions', authenticate, authorize('teacher', 'admin'), listBankQuestionsHandler);
  router.put('/question-banks/:id', authenticate, authorize('teacher', 'admin'), updateBankHandler);
  router.post('/questions/attach-to-bank', authenticate, authorize('teacher', 'admin'), attachQuestionsHandler);

  // Quiz Attempt routes
  router.post('/quiz-attempts', authenticate, authorize('student'), createQuizAttemptHandler);
  router.get('/quiz-attempts', authenticate, listQuizAttemptsHandler);
  router.get('/quiz-attempts/:id', authenticate, getQuizAttemptHandler);
  router.get('/quiz-attempts/:id/presentation', authenticate, presentationHandler);
  router.put('/quiz-attempts/:id/submit', authenticate, authorize('student'), submitQuizAttemptHandler);

  // Manual grading and grade history (teacher/admin)
  router.post(
    '/quiz-attempts/:id/manual-grade',
    authenticate,
    authorize('teacher', 'admin'),
    manualGradeHandler,
  );
  router.get('/quiz-attempts/:id/grade-history', authenticate, gradeHistoryHandler);

  // Recheck workflow: students create, teachers/admins decide
  router.post('/quiz-attempts/:id/recheck', authenticate, authorize('student'), createRecheckHandler);
  router.get('/recheck-requests', authenticate, authorize('teacher', 'admin'), listRecheckHandler);
  router.post(
    '/recheck-requests/:id/decision',
    authenticate,
    authorize('teacher', 'admin'),
    decideRecheckHandler,
  );

  router.delete('/quiz-attempts/:id', authenticate, authorize('student', 'admin'), deleteQuizAttemptHandler);

  app.use('/api/assessments', router);
}
