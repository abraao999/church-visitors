import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import authRouter from './routes/auth.js';
import visitorsRouter from './routes/visitors.js';
import prayerRequestsRouter from './routes/prayerRequests.js';
import servicesRouter from './routes/services.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-visitors';

export async function ensureDb(): Promise<void> {
  await connectDB(MONGODB_URI);
}

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use(async (_req, res, next) => {
    try {
      await ensureDb();
      next();
    } catch (error) {
      console.error('Erro ao conectar no MongoDB:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Falha ao conectar no banco',
      });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/visitors', visitorsRouter);
  app.use('/api/prayer-requests', prayerRequestsRouter);
  app.use('/api/services', servicesRouter);

  return app;
}

const app = createApp();
export default app;
