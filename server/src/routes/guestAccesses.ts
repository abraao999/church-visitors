import { Router, type Response } from 'express';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import {
  GUEST_ACCESS_TYPES,
  GuestAccess,
  type GuestAccessType,
  type IGuestAccess,
} from '../models/GuestAccess.js';
import { createGuestPublicId, createGuestToken } from '../utils/guestToken.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';

const router = Router();

function isGuestAccessType(value: unknown): value is GuestAccessType {
  return GUEST_ACCESS_TYPES.includes(value as GuestAccessType);
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name && name.length <= 120 ? name : null;
}

function parseFutureDate(value: unknown): Date | null | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
  return date;
}

function serializeAccess(access: Pick<
  IGuestAccess,
  | '_id'
  | 'name'
  | 'publicId'
  | 'type'
  | 'version'
  | 'active'
  | 'expiresAt'
  | 'lastUsedAt'
  | 'createdAt'
  | 'updatedAt'
>) {
  return {
    id: String(access._id),
    name: access.name,
    type: access.type,
    active: access.active,
    expiresAt: access.expiresAt,
    lastUsedAt: access.lastUsedAt,
    createdAt: access.createdAt,
    updatedAt: access.updatedAt,
    token: createGuestToken(access.publicId, access.version),
  };
}

function configurationError(res: Response) {
  return res.status(503).json({
    error:
      'Falta configurar GUEST_ACCESS_SECRET no servidor (.env ou variáveis da Vercel). Use uma chave com pelo menos 32 caracteres e diferente do JWT_SECRET.',
  });
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accesses = await GuestAccess.find(withChurch(req.auth!.churchId))
      .sort({ createdAt: -1 })
      .lean();
    return res.json(accesses.map(serializeAccess));
  } catch (error) {
    if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
      return configurationError(res);
    }
    return res.status(500).json({ error: 'Erro ao carregar acessos sem login.' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.body?.churchId !== undefined) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }

    const name = normalizeName(req.body?.name);
    const type = req.body?.type;
    const expiresAt = parseFutureDate(req.body?.expiresAt);

    if (!name || !isGuestAccessType(type)) {
      return res.status(400).json({ error: 'Informe um nome e uma permissão válidos.' });
    }
    if (expiresAt === null) {
      return res.status(400).json({ error: 'A validade deve ser uma data futura.' });
    }

    // Valida a configuração antes de persistir para não deixar um acesso sem link utilizável.
    createGuestToken(createGuestPublicId(), 1);

    let access: IGuestAccess | undefined;
    for (let attempt = 0; attempt < 3 && !access; attempt += 1) {
      try {
        access = await GuestAccess.create({
          churchId: req.auth!.churchId,
          createdBy: toActor(req.auth!),
          name,
          publicId: createGuestPublicId(),
          type,
          version: 1,
          active: true,
          ...(expiresAt ? { expiresAt } : {}),
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000 || attempt === 2) throw error;
      }
    }

    if (!access) throw new Error('Acesso não criado');
    return res.status(201).json(serializeAccess(access));
  } catch (error) {
    if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
      return configurationError(res);
    }
    return res.status(500).json({ error: 'Erro ao criar acesso sem login.' });
  }
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.body?.churchId !== undefined) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }

    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) return res.status(404).json({ error: 'Acesso não encontrado.' });

    const name = normalizeName(req.body?.name);
    const expiresAt = parseFutureDate(req.body?.expiresAt);
    if (!name) return res.status(400).json({ error: 'Informe um nome válido.' });
    if (expiresAt === null) {
      return res.status(400).json({ error: 'A validade deve ser uma data futura.' });
    }

    const access = await GuestAccess.findOne(filter);
    if (!access) return res.status(404).json({ error: 'Acesso não encontrado.' });

    access.name = name;
    access.expiresAt = expiresAt;
    await access.save();
    return res.json(serializeAccess(access));
  } catch (error) {
    if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
      return configurationError(res);
    }
    return res.status(500).json({ error: 'Erro ao atualizar acesso.' });
  }
});

router.post('/:id/deactivate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) return res.status(404).json({ error: 'Acesso não encontrado.' });
    const access = await GuestAccess.findOneAndUpdate(
      filter,
      { $set: { active: false } },
      { new: true }
    );
    if (!access) return res.status(404).json({ error: 'Acesso não encontrado.' });
    return res.json(serializeAccess(access));
  } catch (error) {
    if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
      return configurationError(res);
    }
    return res.status(500).json({ error: 'Erro ao desativar acesso.' });
  }
});

router.post('/:id/reactivate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) return res.status(404).json({ error: 'Acesso não encontrado.' });
    const access = await GuestAccess.findOneAndUpdate(
      filter,
      { $set: { active: true } },
      { new: true }
    );
    if (!access) return res.status(404).json({ error: 'Acesso não encontrado.' });
    return res.json(serializeAccess(access));
  } catch (error) {
    if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
      return configurationError(res);
    }
    return res.status(500).json({ error: 'Erro ao reativar acesso.' });
  }
});

router.post('/:id/renew', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
    if (!filter) return res.status(404).json({ error: 'Acesso não encontrado.' });
    const access = await GuestAccess.findOneAndUpdate(
      filter,
      { $inc: { version: 1 }, $set: { active: true } },
      { new: true, runValidators: true }
    );
    if (!access) return res.status(404).json({ error: 'Acesso não encontrado.' });
    return res.json(serializeAccess(access));
  } catch (error) {
    if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
      return configurationError(res);
    }
    return res.status(500).json({ error: 'Erro ao gerar um novo link.' });
  }
});

export default router;
