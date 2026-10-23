import express from 'express';
import { bootstrapService } from '@edunet/observability';
import { registerRoutes } from './routes';

const app = bootstrapService({
  serviceName: 'content',
  registerRoutes: (expressApp: express.Express) => registerRoutes(expressApp),
  port: Number(process.env.PORT) || 3008,
});

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  app.start();
}

export { app as service };
