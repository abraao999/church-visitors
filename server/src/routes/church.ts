import { Router, type Response } from 'express';
import { Church } from '../models/Church.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';
import { normalizeChurchName } from '../utils/church.js';
import { toActor } from '../middleware/auth.js';
import {
  clearTrainingData,
  getTrainingOverview,
  seedTrainingData,
  setTrainingMode,
  type TrainingSeedKind,
} from '../services/trainingMode.js';
import {
  deleteChurchLogo,
  getChurchBranding,
  patchChurchBranding,
  postChurchLogo,
  uploadChurchLogo,
} from './churchBranding.js';

const router = Router();

router.get('/branding', requireAuth, requirePermission('church:update'), getChurchBranding);
router.patch('/branding', requireAuth, requirePermission('church:update'), patchChurchBranding);
router.post(
  '/branding/logo',
  requireAuth,
  requirePermission('church:update'),
  uploadChurchLogo,
  postChurchLogo
);
router.delete('/branding/logo', requireAuth, requirePermission('church:update'), deleteChurchLogo);

function normalizeOptionalLine(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function publicChurch(church: {
  _id: unknown;
  name: string;
  slug: string;
  city?: string;
  phone?: string;
  address?: string;
  active: boolean;
  visitorFollowUpEnabled?: boolean;
  trainingModeEnabled?: boolean;
}) {
  return {
    id: String(church._id),
    name: church.name,
    slug: church.slug,
    city: church.city || '',
    phone: church.phone || '',
    address: church.address || '',
    active: church.active,
    visitorFollowUpEnabled: church.visitorFollowUpEnabled === true,
    trainingModeEnabled: church.trainingModeEnabled === true,
  };
}

router.get('/', requireAuth, requireAnyPermission('church:read', 'team:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const church = await Church.findById(req.auth!.churchId);
    if (!church || !church.active) {
      return res.status(404).json({ error: 'Igreja não encontrada.' });
    }
    return res.json(publicChurch(church));
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar os dados da igreja.' });
  }
});

router.patch('/', requireAuth, requirePermission('church:update'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const church = await Church.findById(req.auth!.churchId);
    if (!church || !church.active) {
      return res.status(404).json({ error: 'Igreja não encontrada.' });
    }

    const name = normalizeChurchName(req.body?.name);
    if (!name) {
      return res.status(400).json({ error: 'Informe o nome da igreja.' });
    }

    church.name = name;
    church.city = normalizeOptionalLine(req.body?.city, 100);
    church.phone = normalizeOptionalLine(req.body?.phone, 40);
    church.address = normalizeOptionalLine(req.body?.address, 200);
    if (typeof req.body?.visitorFollowUpEnabled === 'boolean') {
      church.visitorFollowUpEnabled = req.body.visitorFollowUpEnabled === true;
    }
    if (typeof req.body?.trainingModeEnabled === 'boolean') {
      church.trainingModeEnabled = req.body.trainingModeEnabled === true;
    }
    await church.save();

    return res.json(publicChurch(church));
  } catch {
    return res.status(500).json({ error: 'Não foi possível salvar os dados da igreja.' });
  }
});

router.patch(
  '/visitor-follow-up',
  requireAuth,
  requirePermission('church:update'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.body && typeof req.body === 'object' && 'churchId' in req.body) {
        return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
      }
      const church = await Church.findById(req.auth!.churchId);
      if (!church || !church.active) {
        return res.status(404).json({ error: 'Igreja não encontrada.' });
      }
      church.visitorFollowUpEnabled = req.body?.visitorFollowUpEnabled === true;
      await church.save();
      return res.json(publicChurch(church));
    } catch {
      return res.status(500).json({ error: 'Não foi possível salvar o acompanhamento de visitantes.' });
    }
  }
);

router.get(
  '/training',
  requireAuth,
  requirePermission('church:update'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      return res.json(await getTrainingOverview(req.auth!.churchId));
    } catch {
      return res.status(500).json({ error: 'Não foi possível carregar o treinamento.' });
    }
  }
);

router.patch(
  '/training',
  requireAuth,
  requirePermission('church:update'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.body && typeof req.body === 'object' && 'churchId' in req.body) {
        return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
      }
      return res.json(await setTrainingMode(req.auth!.churchId, req.body?.enabled === true));
    } catch {
      return res.status(500).json({ error: 'Não foi possível atualizar o treinamento.' });
    }
  }
);

router.post(
  '/training/seed',
  requireAuth,
  requirePermission('church:update'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const kind = req.body?.kind;
      if (!['visitors', 'prayers', 'vehicle', 'service'].includes(kind)) {
        return res.status(400).json({ error: 'Informe o tipo de simulação.' });
      }
      return res.json(await seedTrainingData(req.auth!.churchId, toActor(req.auth!), kind as TrainingSeedKind));
    } catch {
      return res.status(500).json({ error: 'Não foi possível criar os dados de treinamento.' });
    }
  }
);

router.post(
  '/training/clear',
  requireAuth,
  requirePermission('church:update'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.body?.confirmation !== 'APAGAR TESTES') {
        return res.status(400).json({ error: 'Confirme a limpeza dos dados de treinamento.' });
      }
      return res.json(await clearTrainingData(req.auth!.churchId));
    } catch {
      return res.status(500).json({ error: 'Não foi possível apagar os dados de treinamento.' });
    }
  }
);

export default router;
