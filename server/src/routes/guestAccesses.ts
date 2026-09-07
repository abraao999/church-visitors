import { Router, type Response } from 'express';
import {
  requireAuth,
  toActor,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { hasAnyPermission } from '../utils/permissions.js';
import {
  GuestAccess,
  type GuestAccessType,
  type IGuestAccess,
} from '../models/GuestAccess.js';
import { createGuestPublicId, createGuestToken } from '../utils/guestToken.js';
import {
  isPanelOnlyAccess,
  mixesPanelAndFormScopes,
  parseGuestAccessTypes,
  resolveGuestAccessTypes,
} from '../utils/guestAccessTypes.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';

const router = Router();

function serializeAccess(access: Pick<
  IGuestAccess,
  | '_id'
  | 'name'
  | 'publicId'
  | 'type'
  | 'types'
  | 'version'
  | 'active'
  | 'expiresAt'
  | 'lastUsedAt'
  | 'createdAt'
  | 'updatedAt'
>) {
  const types = resolveGuestAccessTypes(access);
  return {
    id: String(access._id),
    name: access.name,
    type: types[0] || access.type,
    types,
    panel: isPanelOnlyAccess(types),
    specific: types.length === 1,
    active: access.active,
    expiresAt: access.expiresAt,
    lastUsedAt: access.lastUsedAt,
    createdAt: access.createdAt,
    updatedAt: access.updatedAt,
    token: createGuestToken(access.publicId, access.version),
  };
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

function canManageFormAccesses(req: AuthenticatedRequest): boolean {
  return hasAnyPermission(req.auth?.permissions, [
    'visitors:create',
    'prayers:create',
    'vehicle_notices:create',
  ]);
}

function typesFromBody(body: unknown): GuestAccessType[] {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return parseGuestAccessTypes(payload.types ?? payload.type);
}

const MIXED_SCOPES_ERROR =
  'Um mesmo link não pode juntar painel de TV e formulários. Crie um acesso separado para o painel.';

function configurationError(res: Response) {
  return res.status(503).json({
    error:
      'Falta configurar GUEST_ACCESS_SECRET no servidor (.env ou variáveis da Vercel). Use uma chave com pelo menos 32 caracteres e diferente do JWT_SECRET.',
  });
}

router.get('/', requireAuth, requirePermission('guest_accesses:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accesses = await GuestAccess.find(withChurch(req.auth!.churchId))
      .sort({ createdAt: -1 })
      .lean();
    const visible = canManageFormAccesses(req)
      ? accesses
      : accesses.filter((access) => isPanelOnlyAccess(resolveGuestAccessTypes(access)));
    return res.json(visible.map(serializeAccess));
  } catch (error) {
    if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
      return configurationError(res);
    }
    return res.status(500).json({ error: 'Erro ao carregar acessos sem login.' });
  }
});

router.post('/', requireAuth, requirePermission('guest_accesses:create'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.body?.churchId !== undefined) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }

    const name = normalizeName(req.body?.name);
    const types = typesFromBody(req.body);
    const expiresAt = parseFutureDate(req.body?.expiresAt);

    if (!name || types.length === 0) {
      return res.status(400).json({ error: 'Informe um nome e pelo menos uma opção autorizada.' });
    }
    if (mixesPanelAndFormScopes(types)) {
      return res.status(400).json({ error: MIXED_SCOPES_ERROR });
    }
    if (!canManageFormAccesses(req) && !isPanelOnlyAccess(types)) {
      return res.status(403).json({ error: 'Este acesso só pode criar links de leitura para as TVs.' });
    }
    if (expiresAt === null) {
      return res.status(400).json({ error: 'A validade deve ser uma data futura.' });
    }

    createGuestToken(createGuestPublicId(), 1);

    let access: IGuestAccess | undefined;
    for (let attempt = 0; attempt < 3 && !access; attempt += 1) {
      try {
        access = await GuestAccess.create({
          churchId: req.auth!.churchId,
          createdBy: toActor(req.auth!),
          name,
          publicId: createGuestPublicId(),
          type: types[0],
          types,
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

router.put('/:id', requireAuth, requirePermission('guest_accesses:update'), async (req: AuthenticatedRequest, res: Response) => {
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

    const requestedTypes = typesFromBody(req.body);
    const types = requestedTypes.length > 0 ? requestedTypes : resolveGuestAccessTypes(access);
    if (types.length === 0) {
      return res.status(400).json({ error: 'Selecione pelo menos uma opção autorizada.' });
    }
    if (mixesPanelAndFormScopes(types)) {
      return res.status(400).json({ error: MIXED_SCOPES_ERROR });
    }
    if (!canManageFormAccesses(req) && !isPanelOnlyAccess(types)) {
      return res.status(403).json({ error: 'Este acesso só pode alterar links de leitura para as TVs.' });
    }

    access.name = name;
    access.type = types[0];
    access.types = types;
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

router.post('/:id/deactivate', requireAuth, requirePermission('guest_accesses:revoke'), async (req: AuthenticatedRequest, res: Response) => {
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

router.post('/:id/reactivate', requireAuth, requirePermission('guest_accesses:update'), async (req: AuthenticatedRequest, res: Response) => {
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

router.post('/:id/renew', requireAuth, requirePermission('guest_accesses:update'), async (req: AuthenticatedRequest, res: Response) => {
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
