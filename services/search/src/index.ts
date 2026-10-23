import express from 'express';
import { bootstrapService } from '@edunet/observability';
import { registerRoutes } from './routes';

const app = bootstrapService({
  serviceName: 'search',
  registerRoutes: (expressApp: express.Express) => registerRoutes(expressApp),
  port: Number(process.env.PORT) || 3012,
});

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  app.start();
}

export { app as service };
