import express from 'express';
import { bootstrapService } from '@edunet/observability';
import { registerRoutes } from './routes';
import { databaseReadyCheck } from '@edunet/database';

const app = bootstrapService({
  serviceName: 'ai',
  registerRoutes: (expressApp: express.Express) => registerRoutes(expressApp),
  readyCheck: databaseReadyCheck,
  port: Number(process.env.PORT) || 3018,
});

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  app.start();
}

export { app as service };
