/**
 * Application entry point — bootstraps Express, middleware, routes,
 * the WebSocket broadcaster, and the polling scheduler.
 */
import 'dotenv/config';

// Fast-fail: surface missing configuration immediately rather than
// failing silently at runtime deep inside a service module.
const REQUIRED_ENV = ['PORT', 'DATABASE_URL'] as const;
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}


import express, { Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {initWebSocket, broadcast} from './services/broadcaster';
import { monitorsRouter } from './routes/monitors';
import { discoveryRouter } from './routes/discovery';
import { instancesRouter } from './routes/instances';
import { startScheduler } from './services/scheduler';
import healthRoutes from './routes/health';
import jvmRoutes from './routes/jvm';
import { Server } from 'http';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

const skipForMonitoring = (req: Request) => {
  const path = req.path;
  return path.startsWith('/api/monitors') || 
         path.startsWith('/api/health') || 
         path.startsWith('/api/jvm') ||
         path.startsWith('/api/discovery');
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
   message: { error: 'Too many requests, please slow down' }
});
app.use('/api/', limiter);

app.use('/api/monitors', monitorsRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/instances', instancesRouter);
app.use('/api/health', healthRoutes);
app.use('/api/jvm', jvmRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  startScheduler();
});

initWebSocket(server);