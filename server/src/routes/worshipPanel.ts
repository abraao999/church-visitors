import { Router, type Response } from 'express';
import { getJwtSecret, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';
import { fetchWorshipPanel } from '../services/panelData.js';
import { parseDateOnly } from '../utils/dayRange.js';
import { sendPrivateJson } from '../utils/publicRecord.js';
import { clientIp, consumeRateLimit, sendRateLimited } from '../utils/rateLimit.js';

const router = Router();
const PANEL_READ_LIMIT = 180;

export async function listWorshipPanel(req: AuthenticatedRequest, res: Response) {
  try {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (dateParam) {
      const date = parseDateOnly(dateParam);
      if (!date) {
        return res.status(400).json({ error: 'Parâmetro date inválido. Use YYYY-MM-DD' });
      }
    }

    return sendPrivateJson(res, await fetchWorshipPanel(req.auth!.churchId));
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar o painel agora.' });
  }
}

router.get(
  '/',
  requireAuth,
  requireAnyPermission('panels:open', 'prayers:project', 'visitors:read'),
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const allowed = await consumeRateLimit(
        getJwtSecret(),
        'worship-panel',
        `${req.auth!.churchId}|${clientIp(req)}`,
        PANEL_READ_LIMIT
      );
      if (!allowed) {
        return sendRateLimited(res, {
          error: 'Muitas atualizações deste painel. Aguarde alguns minutos.',
        });
      }
      next();
    } catch {
      next();
    }
  },
  listWorshipPanel
);

export default router;
