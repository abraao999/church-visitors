import { Router } from 'express';
import { loadPublicPlatformStatus } from '../services/platformSettings.js';
import { getJwtSecret } from '../middleware/auth.js';
import { clientIp, consumeRateLimit, sendRateLimited } from '../utils/rateLimit.js';

const router = Router();
const PUBLIC_STATUS_LIMIT = 60;

router.get('/public', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if ('churchId' in req.query || (req.body && typeof req.body === 'object' && 'churchId' in req.body)) {
    return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
  }

  try {
    const secret = getJwtSecret();
    if (!(await consumeRateLimit(secret, 'platform-public-ip', clientIp(req), PUBLIC_STATUS_LIMIT))) {
      return sendRateLimited(res, { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }
  } catch {
    // Sem JWT_SECRET o status público ainda precisa responder.
  }

  try {
    return res.json(await loadPublicPlatformStatus());
  } catch {
    return res.json({
      registrationsEnabled: true,
      maintenance: { enabled: false, message: '' },
    });
  }
});

export default router;
