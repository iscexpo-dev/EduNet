import { Router } from 'express';
import { authenticate } from '@edunet/rbac';
import {
  archiveConversationHandler,
  createConversationHandler,
  feedbackHandler,
  getConversationHandler,
  listConversationsHandler,
  listMessagesHandler,
  listPromptTemplatesHandler,
  sendMessageHandler,
  upsertPromptTemplateHandler,
  usageHandler,
} from './handlers';

export function registerRoutes(app: any) {
  const router = Router();

  // Conversations and messages (tenant- and user-scoped in every handler).
  router.get('/conversations', authenticate, listConversationsHandler);
  router.post('/conversations', authenticate, createConversationHandler);
  router.get('/conversations/:id', authenticate, getConversationHandler);
  router.get('/conversations/:id/messages', authenticate, listMessagesHandler);
  router.post('/conversations/:id/messages', authenticate, sendMessageHandler);
  router.delete('/conversations/:id', authenticate, archiveConversationHandler);

  // Feedback on an assistant message.
  router.post('/messages/:id/feedback', authenticate, feedbackHandler);

  // Quotas and prompt management.
  router.get('/usage/today', authenticate, usageHandler);
  router.get('/prompts', authenticate, listPromptTemplatesHandler);
  router.put('/prompts', authenticate, upsertPromptTemplateHandler);

  app.use('/api/ai', router);
}
