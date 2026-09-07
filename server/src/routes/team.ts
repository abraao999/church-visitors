import { Router, type Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth, toActor, revokeAuthTokens, type AuthenticatedRequest } from '../middleware/auth.js';
import { FORBIDDEN_ERROR, requirePermission } from '../middleware/requirePermission.js';
import { TeamAuditEvent, type TeamAuditAction } from '../models/TeamAuditEvent.js';
import { TeamInvitation, type ITeamInvitation } from '../models/TeamInvitation.js';
import { User } from '../models/User.js';
import { Church } from '../models/Church.js';
import {
  createInvitePublicId,
  createInviteToken,
  invitePath,
} from '../utils/inviteToken.js';
import {
  DEFAULT_INVITE_TTL_DAYS,
  INVITE_TTL_DAYS,
  TEAM_ROLE_LABELS,
  canGrantPermissions,
  clampPermissionsToGrant,
  isInvitableRole,
  isTeamRole,
  permissionsForRole,
  resolvePermissions,
  samePermissionSet,
  sanitizePermissions,
  type Permission,
  type TeamRole,
} from '../utils/permissions.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';

const router = Router();

const GENERIC_INVITE_ERROR = 'Não foi possível concluir. Fale com o responsável.';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function inviteTtlDays(value: unknown): number | null {
  const days = typeof value === 'number' ? value : Number(value);
  return (INVITE_TTL_DAYS as readonly number[]).includes(days) ? days : null;
}

function inviteComputedStatus(invite: Pick<ITeamInvitation, 'status' | 'expiresAt'>): string {
  if (invite.status !== 'pending') return invite.status;
  return invite.expiresAt.getTime() <= Date.now() ? 'expired' : 'pending';
}

function serializeInvite(
  invite: ITeamInvitation,
  options: { includeUrl?: boolean } = {}
) {
  const status = inviteComputedStatus(invite);
  const permissions = resolvePermissions(invite);
  const body: Record<string, unknown> = {
    id: String(invite._id),
    name: invite.name,
    email: invite.email || undefined,
    role: invite.role,
    roleLabel: TEAM_ROLE_LABELS[invite.role],
    permissions,
    permissionsCustomized: invite.permissionsCustomized === true,
    status,
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
  };
  if (options.includeUrl && status === 'pending') {
    const token = createInviteToken(invite.publicId, invite.version, String(invite.churchId));
    body.path = invitePath(token);
  }
  return body;
}

function serializeMember(
  user: {
    _id: unknown;
    name: string;
    email: string;
    username?: string;
    role: TeamRole;
    permissions?: Permission[];
    permissionsCustomized?: boolean;
    active?: boolean;
    lastSeenAt?: Date;
    deactivatedAt?: Date;
    permissionsUpdatedAt?: Date;
    permissionsUpdatedBy?: { name?: string };
  },
  currentUserId: string
) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    username: user.username || undefined,
    role: user.role,
    roleLabel: TEAM_ROLE_LABELS[user.role],
    permissions: resolvePermissions(user),
    permissionsCustomized: user.permissionsCustomized === true,
    active: user.active !== false,
    lastSeenAt: user.lastSeenAt?.toISOString(),
    you: String(user._id) === currentUserId,
    deactivatedAt: user.deactivatedAt?.toISOString(),
    permissionsUpdatedAt: user.permissionsUpdatedAt?.toISOString(),
    permissionsUpdatedByName: user.permissionsUpdatedBy?.name,
  };
}

async function recordAudit(
  churchId: string,
  action: TeamAuditAction,
  actor: ReturnType<typeof toActor>,
  extra: { targetUserId?: Types.ObjectId; targetInvitationId?: Types.ObjectId } = {}
): Promise<void> {
  await TeamAuditEvent.create({
    churchId,
    action,
    actor,
    ...extra,
  });
}

function resolveRequestedPermissions(
  role: TeamRole,
  body: Record<string, unknown>,
  granter: readonly Permission[]
): { permissions: Permission[]; customized: boolean; error?: string } {
  const defaults = permissionsForRole(role);
  const customized = body.permissionsCustomized === true;
  if (!customized) {
    if (!canGrantPermissions(granter, defaults)) {
      return { permissions: [], customized: false, error: FORBIDDEN_ERROR };
    }
    return { permissions: defaults, customized: false };
  }
  const requested = sanitizePermissions(body.permissions);
  if (requested.length === 0) {
    return { permissions: [], customized: true, error: 'Selecione pelo menos uma permissão.' };
  }
  if (!canGrantPermissions(granter, requested)) {
    return { permissions: [], customized: true, error: FORBIDDEN_ERROR };
  }
  return {
    permissions: clampPermissionsToGrant(requested, granter),
    customized: !samePermissionSet(requested, defaults),
  };
}

router.use(requireAuth);

router.get('/', requirePermission('team:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const churchId = req.auth!.churchId;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const roleFilter = isTeamRole(req.query.role) ? req.query.role : undefined;
    const statusFilter =
      req.query.status === 'active' ||
      req.query.status === 'inactive' ||
      req.query.status === 'pending' ||
      req.query.status === 'expired'
        ? req.query.status
        : 'all';

    const memberFilter = withChurch(churchId);
    if (roleFilter) Object.assign(memberFilter, { role: roleFilter });

    const members = await User.find(memberFilter)
      .select(
        'name email username role permissions permissionsCustomized active lastSeenAt deactivatedAt permissionsUpdatedAt permissionsUpdatedBy'
      )
      .sort({ createdAt: 1 })
      .lean();

    const invites = await TeamInvitation.find(withChurch(churchId, { status: 'pending' }))
      .sort({ createdAt: -1 });

    const filteredMembers = members.filter((member) => {
      if (statusFilter === 'active' && member.active === false) return false;
      if (statusFilter === 'inactive' && member.active !== false) return false;
      if (statusFilter === 'pending' || statusFilter === 'expired') return false;
      if (!q) return true;
      return (
        member.name.toLowerCase().includes(q) ||
        member.email.toLowerCase().includes(q) ||
        (member.username || '').includes(q)
      );
    });

    const pending = invites.filter((invite) => inviteComputedStatus(invite) === 'pending');
    const expired = invites.filter((invite) => inviteComputedStatus(invite) === 'expired');

    const filteredInvites = (statusFilter === 'expired' ? expired : pending).filter((invite) => {
      if (roleFilter && invite.role !== roleFilter) return false;
      if (statusFilter === 'active' || statusFilter === 'inactive') return false;
      if (!q) return true;
      return (
        invite.name.toLowerCase().includes(q) || (invite.email || '').includes(q)
      );
    });

    const church = await Church.findById(churchId).select('name');

    return res.json({
      churchName: church?.name || '',
      stats: {
        activeMembers: members.filter((member) => member.active !== false).length,
        pendingInvites: pending.length,
        roles: 5,
      },
      members: filteredMembers.map((member) =>
        serializeMember(member, req.auth!.userId)
      ),
      invitations: (statusFilter === 'all' ? [...pending, ...expired] : filteredInvites)
        .filter((invite) => {
          if (roleFilter && invite.role !== roleFilter) return false;
          if (!q) return true;
          return invite.name.toLowerCase().includes(q) || (invite.email || '').includes(q);
        })
        .map((invite) => serializeInvite(invite, { includeUrl: true })),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
      return res.status(503).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Não foi possível carregar a equipe.' });
  }
});

router.post(
  '/invitations',
  requirePermission('team:invite'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.body?.churchId !== undefined) {
        return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
      }

      const name = normalizeName(req.body?.name);
      const email = normalizeEmail(req.body?.email);
      const role = req.body?.role;
      const days = inviteTtlDays(req.body?.ttlDays) ?? DEFAULT_INVITE_TTL_DAYS;

      if (!name || !isInvitableRole(role)) {
        return res.status(400).json({ error: 'Informe o nome e a função da pessoa.' });
      }
      if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: 'Informe um e-mail válido ou deixe em branco.' });
      }

      const resolved = resolveRequestedPermissions(role, req.body || {}, req.auth!.permissions);
      if (resolved.error) {
        return res.status(resolved.error === FORBIDDEN_ERROR ? 403 : 400).json({
          error: resolved.error,
        });
      }

      if (email) {
        const existing = await User.findOne({ email }).select('churchId');
        if (existing) {
          return res.status(400).json({ error: GENERIC_INVITE_ERROR });
        }
        const duplicate = await TeamInvitation.findOne(
          withChurch(req.auth!.churchId, { email, status: 'pending' })
        );
        if (duplicate && duplicate.expiresAt.getTime() > Date.now()) {
          return res.status(400).json({
            error: 'Já existe um convite pendente para este e-mail.',
          });
        }
      }

      let invite: ITeamInvitation | undefined;
      for (let attempt = 0; attempt < 3 && !invite; attempt += 1) {
        try {
          invite = await TeamInvitation.create({
            churchId: req.auth!.churchId,
            name,
            email: email || undefined,
            publicId: createInvitePublicId(),
            version: 1,
            role,
            permissions: resolved.permissions,
            permissionsCustomized: resolved.customized,
            status: 'pending',
            expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
            createdBy: toActor(req.auth!),
          });
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
        }
      }

      if (!invite) {
        return res.status(500).json({ error: 'Não foi possível gerar o convite.' });
      }

      await recordAudit(req.auth!.churchId, 'invite_created', toActor(req.auth!), {
        targetInvitationId: invite._id as Types.ObjectId,
      });

      return res.status(201).json(serializeInvite(invite, { includeUrl: true }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
        return res.status(503).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Não foi possível gerar o convite.' });
    }
  }
);

router.post(
  '/invitations/:id/cancel',
  requirePermission('team:invite'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
      if (!filter) return res.status(404).json({ error: 'Convite não encontrado.' });

      const invite = await TeamInvitation.findOneAndUpdate(
        { ...filter, status: 'pending' },
        {
          $set: { status: 'cancelled', cancelledAt: new Date() },
          $inc: { version: 1 },
        },
        { new: true }
      );
      if (!invite) return res.status(404).json({ error: 'Convite não encontrado.' });

      await recordAudit(req.auth!.churchId, 'invite_cancelled', toActor(req.auth!), {
        targetInvitationId: invite._id as Types.ObjectId,
      });
      return res.json(serializeInvite(invite));
    } catch {
      return res.status(500).json({ error: 'Não foi possível cancelar o convite.' });
    }
  }
);

router.post(
  '/invitations/:id/renew',
  requirePermission('team:invite'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
      if (!filter) return res.status(404).json({ error: 'Convite não encontrado.' });

      const days = inviteTtlDays(req.body?.ttlDays) ?? DEFAULT_INVITE_TTL_DAYS;
      const invite = await TeamInvitation.findOne({ ...filter, status: 'pending' });
      if (!invite) return res.status(404).json({ error: 'Convite não encontrado.' });

      invite.version += 1;
      invite.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await invite.save();

      await recordAudit(req.auth!.churchId, 'invite_renewed', toActor(req.auth!), {
        targetInvitationId: invite._id as Types.ObjectId,
      });
      return res.json(serializeInvite(invite, { includeUrl: true }));
    } catch (error) {
      if (error instanceof Error && error.message.includes('GUEST_ACCESS_SECRET')) {
        return res.status(503).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Não foi possível gerar um novo convite.' });
    }
  }
);

router.get(
  '/members/:id',
  requirePermission('team:read'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
      if (!filter) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      const member = await User.findOne(filter).select(
        'name email username role permissions permissionsCustomized active lastSeenAt deactivatedAt permissionsUpdatedAt permissionsUpdatedBy'
      );
      if (!member) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      return res.json(serializeMember(member, req.auth!.userId));
    } catch {
      return res.status(500).json({ error: 'Não foi possível carregar a pessoa.' });
    }
  }
);

router.patch(
  '/members/:id',
  requirePermission('team:update'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (req.body?.churchId !== undefined) {
        return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
      }

      const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
      if (!filter) return res.status(404).json({ error: 'Pessoa não encontrada.' });

      const member = await User.findOne(filter);
      if (!member) return res.status(404).json({ error: 'Pessoa não encontrada.' });

      if (member.role === 'owner' && req.auth!.role !== 'owner') {
        return res.status(403).json({ error: FORBIDDEN_ERROR });
      }
      if (String(member._id) === req.auth!.userId && req.body?.role && req.body.role !== member.role) {
        return res.status(400).json({ error: 'Não é possível alterar a própria função nesta tela.' });
      }

      const nextRole = req.body?.role;
      if (nextRole !== undefined) {
        if (!isTeamRole(nextRole) || nextRole === 'owner') {
          return res.status(400).json({ error: 'Função inválida.' });
        }
        if (req.auth!.role !== 'owner' && nextRole === 'admin' && member.role !== 'admin') {
          // admin pode manter admin, mas não promover a owner (já bloqueado) 
        }
      }

      const role: TeamRole = isInvitableRole(nextRole) ? nextRole : member.role;
      if (role === 'owner') {
        return res.status(400).json({ error: 'A transferência de propriedade não está disponível.' });
      }

      const resolved = resolveRequestedPermissions(
        role,
        req.body && typeof req.body === 'object' ? req.body : {},
        req.auth!.permissions
      );
      if (resolved.error) {
        return res.status(resolved.error === FORBIDDEN_ERROR ? 403 : 400).json({
          error: resolved.error,
        });
      }

      const roleChanged = role !== member.role;
      const permissionsChanged = !samePermissionSet(
        resolvePermissions(member),
        resolved.customized ? resolved.permissions : permissionsForRole(role)
      );

      member.role = role;
      member.permissions = resolved.customized ? resolved.permissions : [];
      member.permissionsCustomized = resolved.customized;
      member.permissionsUpdatedAt = new Date();
      member.permissionsUpdatedBy = toActor(req.auth!);
      if (roleChanged || permissionsChanged) {
        member.tokenVersion = (member.tokenVersion ?? 0) + 1;
      }
      await member.save();

      if (roleChanged) {
        await recordAudit(req.auth!.churchId, 'role_changed', toActor(req.auth!), {
          targetUserId: member._id as Types.ObjectId,
        });
      }
      if (permissionsChanged) {
        await recordAudit(req.auth!.churchId, 'permissions_changed', toActor(req.auth!), {
          targetUserId: member._id as Types.ObjectId,
        });
      }

      return res.json(serializeMember(member, req.auth!.userId));
    } catch {
      return res.status(500).json({ error: 'Não foi possível salvar as alterações.' });
    }
  }
);

router.post(
  '/members/:id/deactivate',
  requirePermission('team:deactivate'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
      if (!filter) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      const member = await User.findOne(filter);
      if (!member) return res.status(404).json({ error: 'Pessoa não encontrada.' });

      if (String(member._id) === req.auth!.userId) {
        return res.status(400).json({ error: 'Você não pode desativar a própria conta nesta tela.' });
      }
      if (member.role === 'owner') {
        return res.status(403).json({ error: FORBIDDEN_ERROR });
      }

      member.active = false;
      member.deactivatedAt = new Date();
      member.deactivatedBy = toActor(req.auth!);
      member.tokenVersion = (member.tokenVersion ?? 0) + 1;
      await member.save();

      await recordAudit(req.auth!.churchId, 'account_deactivated', toActor(req.auth!), {
        targetUserId: member._id as Types.ObjectId,
      });
      return res.json(serializeMember(member, req.auth!.userId));
    } catch {
      return res.status(500).json({ error: 'Não foi possível desativar o acesso.' });
    }
  }
);

router.post(
  '/members/:id/reactivate',
  requirePermission('team:deactivate'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
      if (!filter) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      const member = await User.findOne(filter);
      if (!member) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      if (member.role === 'owner' && req.auth!.role !== 'owner') {
        return res.status(403).json({ error: FORBIDDEN_ERROR });
      }

      member.active = true;
      member.deactivatedAt = undefined;
      member.deactivatedBy = undefined;
      await member.save();

      await recordAudit(req.auth!.churchId, 'account_reactivated', toActor(req.auth!), {
        targetUserId: member._id as Types.ObjectId,
      });
      return res.json(serializeMember(member, req.auth!.userId));
    } catch {
      return res.status(500).json({ error: 'Não foi possível reativar o acesso.' });
    }
  }
);

router.post(
  '/members/:id/revoke-sessions',
  requirePermission('team:update'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const filter = tenantRecordFilter(req.auth!.churchId, req.params.id);
      if (!filter) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      const member = await User.findOne(filter).select('_id churchId role');
      if (!member) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      if (member.role === 'owner' && req.auth!.role !== 'owner') {
        return res.status(403).json({ error: FORBIDDEN_ERROR });
      }

      await revokeAuthTokens(String(member._id), req.auth!.churchId);
      await recordAudit(req.auth!.churchId, 'sessions_revoked', toActor(req.auth!), {
        targetUserId: member._id as Types.ObjectId,
      });
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: 'Não foi possível encerrar as sessões.' });
    }
  }
);

export default router;
