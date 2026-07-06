// backend/src/server.ts
import 'dotenv/config';

// SET ENV DEFAULTS BEFORE ANY IMPORTS THAT READ THEM
if (!process.env.USE_TEST_FILE && !process.env.TOMCAT_STATUS_URL) {
  process.env.USE_TEST_FILE = 'true';
}
process.env.TOMCAT_SCHEME = process.env.TOMCAT_SCHEME || 'http';
process.env.TOMCAT_HOST = process.env.TOMCAT_HOST || 'localhost';
process.env.TOMCAT_PORT = process.env.TOMCAT_PORT || '8080';

// NOW import everything else
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { monitorsRouter } from './routes/monitors';
import { discoveryRouter } from './routes/discovery';
import { startScheduler } from './services/scheduler';
import healthRoutes from './routes/health';
import jvmRoutes from './routes/jvm';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

const skipForMonitoring = (req) => {
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

// Routes
app.use('/api/monitors', monitorsRouter);
app.use('/api/discovery', discoveryRouter);
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

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
  startScheduler();
});