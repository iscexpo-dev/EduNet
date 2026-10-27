import { Router } from 'express';
import { authorize, authenticate } from '@edunet/rbac';
import {
  createParentChildRelationshipHandler,
  getParentChildRelationshipHandler,
  listChildrenHandler,
  listParentsHandler,
  updateParentChildRelationshipHandler,
  deleteParentChildRelationshipHandler,
  getChildEnrollmentsHandler,
  getChildSubmissionsHandler,
} from './handlers';


export function registerRoutes(app: any) {
  const router = Router();

  // Parent-Child Relationship routes
  // Relationship links are school-verified: only administrators may create or
  // change them. Parents have read access to their own relationship record.
  router.post('/relationships', authenticate, authorize('admin'), createParentChildRelationshipHandler);
  router.get('/relationships/:id', authenticate, getParentChildRelationshipHandler);
  router.put('/relationships/:id', authenticate, authorize('admin'), updateParentChildRelationshipHandler);
  router.delete('/relationships/:id', authenticate, authorize('admin'), deleteParentChildRelationshipHandler);

  // Children and Parents listing
  router.get('/children', authenticate, authorize('parent'), listChildrenHandler);
  router.get('/parents', authenticate, authorize('admin'), listParentsHandler);

  // Child progress for parents
  router.get('/children/:childId/enrollments', authenticate, authorize('parent', 'admin'), getChildEnrollmentsHandler);
  router.get('/children/:childId/submissions', authenticate, authorize('parent', 'admin'), getChildSubmissionsHandler);

  app.use('/api/parents', router);
}
