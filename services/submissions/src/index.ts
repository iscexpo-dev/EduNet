import express from 'express';
import { bootstrapService } from '@edunet/observability';
import { registerRoutes } from './routes';
import { databaseReadyCheck } from '@edunet/database';

const app = bootstrapService({
  serviceName: 'submissions',
  registerRoutes: (expressApp: express.Express) => registerRoutes(expressApp),
  readyCheck: databaseReadyCheck,
  port: Number(process.env.PORT) || 3007,
});

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  app.start();
}

export { app as service };

// Preserve the public middleware surface for backwards compatibility.

