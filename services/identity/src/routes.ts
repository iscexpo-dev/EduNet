import { Router } from 'express';
import {
  registerHandler,
  loginHandler,
  refreshTokenHandler,
  logoutHandler,
  passwordResetRequestHandler,
  passwordResetConfirmHandler,
  verificationRequestHandler,
  verificationConfirmHandler,
  listSessionsHandler,
  revokeSessionHandler,
  listAuditHandler,
} from './handlers';
import { authenticate } from './middleware';
import { authorize } from '@edunet/rbac';
import { findUserById } from './db';

export function registerRoutes(app: any) {
  const router = Router();

  router.post('/register', registerHandler);
  router.post('/login', loginHandler);
  router.post('/refresh', refreshTokenHandler);
  router.post('/logout', logoutHandler);
  router.post('/password-reset/request', passwordResetRequestHandler);
  router.post('/password-reset/confirm', passwordResetConfirmHandler);

  router.post('/verification/request', authenticate, verificationRequestHandler);
  router.post('/verification/confirm', authenticate, verificationConfirmHandler);
  router.get('/sessions', authenticate, listSessionsHandler);
  router.delete('/sessions/:id', authenticate, revokeSessionHandler);
  router.get('/audit-events', authenticate, authorize('admin'), listAuditHandler);

  router.get('/me', authenticate, async (req: any, res: any) => {
    try {
      const user = await findUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        avatarUrl: user.avatarUrl,
        isVerified: user.isVerified,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api/auth', router);
}
