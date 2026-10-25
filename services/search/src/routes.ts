import { Router, type Express } from 'express';
import { authenticate } from '@edunet/rbac';
import { searchHandler } from './handlers';

export function registerRoutes(app: Express) {
  const router = Router();

  // Search routes
  router.get('/', authenticate, searchHandler);

  app.use('/api/search', router);
}
