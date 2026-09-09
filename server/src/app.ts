import express from 'express';
import { connectDB, publicDatabaseError } from './config/db.js';
import { getJwtSecret } from './middleware/auth.js';
import { createCorsMiddleware, securityHeaders } from './middleware/httpSecurity.js';
import { getGuestAccessSecret } from './utils/guestToken.js';
import authRouter from './routes/auth.js';
import visitorsRouter from './routes/visitors.js';
import prayerRequestsRouter from './routes/prayerRequests.js';
import worshipPanelRouter from './routes/worshipPanel.js';
import servicesRouter from './routes/services.js';
import holyricsRouter from './routes/holyrics.js';
import publicAccessRouter from './routes/publicAccess.js';
import guestAccessesRouter from './routes/guestAccesses.js';
import churchRouter from './routes/church.js';
import vehicleNoticesRouter from './routes/vehicleNotices.js';
import teamRouter from './routes/team.js';
import publicInvitationsRouter from './routes/publicInvitations.js';
import portariaRouter from './routes/portaria.js';
import portariaDevicesRouter from './routes/portariaDevices.js';
import retentionRouter from './routes/retention.js';

const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/church-visitors';

export async function ensureDb(): Promise<void> {
  await connectDB(process.env.MONGODB_URI || DEFAULT_MONGODB_URI);
}

/** Devolve os problemas de configuração dos segredos, sem revelar valores. */
export function secretConfigurationErrors(): string[] {
  const problems: string[] = [];
  for (const check of [getJwtSecret, getGuestAccessSecret]) {
    try {
      check();
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  return problems;
}

export function createApp() {
  const app = express();

  // Em ambiente serverless não há startup para abortar: registra o problema
  // no log para que a causa apareça antes do primeiro login falhar.
  for (const problem of secretConfigurationErrors()) {
    console.error(`Configuração inválida: ${problem}`);
  }

  // Sem isso o proxy da Vercel é o IP de todos os visitantes e o limite dos
  // formulários públicos vira uma cota única. Fica desligado quando não há
  // proxy, senão qualquer um poderia falsificar o IP via X-Forwarded-For.
  const trustProxy = process.env.TRUST_PROXY ?? (process.env.VERCEL === '1' ? '1' : '');
  if (trustProxy) {
    const hops = Number(trustProxy);
    app.set('trust proxy', Number.isInteger(hops) && hops > 0 ? hops : trustProxy);
  }

  app.use(securityHeaders);
  app.use(createCorsMiddleware());
  app.use(express.json({ limit: '32kb' }));

  app.use(async (_req, res, next) => {
    try {
      await ensureDb();
      next();
    } catch (error) {
      console.error('Erro ao conectar no MongoDB:', error);
      res.status(500).json({
        error: publicDatabaseError(error),
      });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/visitors', visitorsRouter);
  app.use('/api/prayer-requests', prayerRequestsRouter);
  app.use('/api/worship-panel', worshipPanelRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/holyrics', holyricsRouter);
  app.use('/api/public-access', publicAccessRouter);
  app.use('/api/guest-accesses', guestAccessesRouter);
  app.use('/api/church', churchRouter);
  app.use('/api/vehicle-notices', vehicleNoticesRouter);
  app.use('/api/team', teamRouter);
  app.use('/api/public-invitations', publicInvitationsRouter);
  app.use('/api/portaria', portariaRouter);
  app.use('/api/portaria-devices', portariaDevicesRouter);
  app.use('/api/retention', retentionRouter);

  return app;
}

const app = createApp();
export default app;
