import { Router } from 'express';
import { authenticate } from '@edunet/rbac';
import {
  addParticipantsHandler,
  blockUserHandler,
  createConversationHandler,
  createForumHandler,
  createForumPostHandler,
  createForumTopicHandler,
  getConversationHandler,
  getForumTopicHandler,
  listBlockedUsersHandler,
  listConversationsHandler,
  listForumTopicsHandler,
  listForumsHandler,
  listMessagesHandler,
  markReadHandler,
  moderationQueueHandler,
  moderateForumPostHandler,
  reportMessageHandler,
  resolveReportHandler,
  sendMessageHandler,
  unblockUserHandler,
  updateTopicHandler,
} from './handlers';

export function registerRoutes(app: any) {
  const router = Router();

  // Conversations and messages
  router.get('/conversations', authenticate, listConversationsHandler);
  router.post('/conversations', authenticate, createConversationHandler);
  router.get('/conversations/:id', authenticate, getConversationHandler);
  router.get('/conversations/:id/messages', authenticate, listMessagesHandler);
  router.post('/conversations/:id/messages', authenticate, sendMessageHandler);
  router.post('/conversations/:id/read', authenticate, markReadHandler);
  router.post('/conversations/:id/participants', authenticate, addParticipantsHandler);

  // Safety
  router.post('/messages/:id/report', authenticate, reportMessageHandler);
  router.get('/moderation/queue', authenticate, moderationQueueHandler);
  router.post('/moderation/reports/:id/resolve', authenticate, resolveReportHandler);
  router.get('/blocks', authenticate, listBlockedUsersHandler);
  router.post('/blocks', authenticate, blockUserHandler);
  router.delete('/blocks/:userId', authenticate, unblockUserHandler);

  // Forums
  router.get('/forums', authenticate, listForumsHandler);
  router.post('/forums', authenticate, createForumHandler);
  router.get('/forums/:id/topics', authenticate, listForumTopicsHandler);
  router.post('/forums/:id/topics', authenticate, createForumTopicHandler);
  router.get('/topics/:id', authenticate, getForumTopicHandler);
  router.post('/topics/:id/posts', authenticate, createForumPostHandler);
  router.patch('/topics/:id', authenticate, updateTopicHandler);
  router.post('/posts/:id/moderate', authenticate, moderateForumPostHandler);

  app.use('/api/communication', router);
}
