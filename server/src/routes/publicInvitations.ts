import { Router, type Response } from 'express';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { TeamAuditEvent } from '../models/TeamAuditEvent.js';
import { TeamInvitation, type ITeamInvitation } from '../models/TeamInvitation.js';
import { User } from '../models/User.js';
import { parseInviteToken, verifyInviteToken } from '../utils/inviteToken.js';
import {
  TEAM_ROLE_LABELS,
  TEAM_ROLE_SUMMARIES,
  permissionSummaries,
  resolvePermissions,
} from '../utils/permissions.js';
import { clientIp, consumeRateLimit, sendRateLimited } from '../utils/rateLimit.js';
import { getGuestAccessSecret } from '../utils/guestToken.js';
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from './auth.js';
import {
  isJwtSecretError,
  JWT_SECRET_HELP,
  signToken,
  type AuthContext,
} from '../middleware/auth.js';
import { setSessionCookie } from '../utils/sessionCookie.js';

const router = Router();

const INVITE_UNAVAILABLE = 'Este convite não está mais disponível.';
const ACCEPT_GENERIC = 'Não foi possível criar o acesso. Fale com o responsável.';
const ALREADY_ON_TEAM = 'Você já faz parte desta equipe. Entre com sua conta.';
const BCRYPT_ROUNDS = 10;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUsername(value: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(value);
}

async function limitPublicInvite(req: { ip?: string; socket?: { remoteAddress?: string } }, res: Response) {
  try {
    const secret = getGuestAccessSecret();
    const ip = clientIp(req as never);
    if (!(await consumeRateLimit(secret, 'team-invite-ip', ip, 20))) {
      sendRateLimited(res, { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

type LoadedInvite =
  | { error: string }
  | { invite: ITeamInvitation; church: { name: string } };

async function loadValidInvite(token: unknown): Promise<LoadedInvite> {
  const parsed = parseInviteToken(token);
  if (!parsed) return { error: INVITE_UNAVAILABLE };

  const invite = await TeamInvitation.findOne({ publicId: parsed.publicId });
  if (!invite) return { error: INVITE_UNAVAILABLE };

  if (!verifyInviteToken(parsed, invite.version, String(invite.churchId))) {
    return { error: INVITE_UNAVAILABLE };
  }

  if (invite.status === 'cancelled') return { error: 'Este convite foi cancelado.' };
  if (invite.status === 'accepted') return { error: 'Este convite já foi utilizado.' };
  if (invite.expiresAt.getTime() <= Date.now()) return { error: 'Este convite expirou.' };

  const church = await Church.findOne({ _id: invite.churchId, active: true }).select('name');
  if (!church) return { error: INVITE_UNAVAILABLE };

  return { invite, church };
}

function usernameFromEmail(email: string): string {
  const local = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 24);
  return local.length >= 3 ? local : `user${local}`.padEnd(3, '0');
}

async function uniqueUsername(base: string): Promise<string> {
  const taken = await User.findOne({ username: base }).select('_id');
  if (!taken) return base;
  return `${base.slice(0, 24)}${Math.random().toString(16).slice(2, 6)}`;
}

router.get('/:token', async (req, res) => {
  if (!(await limitPublicInvite(req, res))) return;
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    if (req.query.churchId !== undefined) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }

    const loaded = await loadValidInvite(req.params.token);
    if ('error' in loaded) {
      return res.status(410).json({ error: loaded.error });
    }

    const { invite, church } = loaded;
    const permissions = resolvePermissions(invite);
    return res.json({
      valid: true,
      churchName: church.name,
      name: invite.name,
      email: invite.email || undefined,
      emailLocked: Boolean(invite.email),
      role: invite.role,
      roleLabel: TEAM_ROLE_LABELS[invite.role],
      roleSummary: TEAM_ROLE_SUMMARIES[invite.role],
      areas: permissionSummaries(permissions),
      expiresAt: invite.expiresAt.toISOString(),
    });
  } catch {
    return res.status(500).json({ error: 'Não foi possível validar o convite.' });
  }
});

router.post('/:token/accept', async (req, res) => {
  if (!(await limitPublicInvite(req, res))) return;
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (
      req.query.churchId !== undefined ||
      body.churchId !== undefined ||
      body.role !== undefined ||
      body.permissions !== undefined
    ) {
      return res.status(400).json({ error: 'Igreja, função e permissões não podem ser enviadas.' });
    }

    const loaded = await loadValidInvite(req.params.token);
    if ('error' in loaded) {
      return res.status(410).json({ error: loaded.error });
    }
    const { invite, church } = loaded;

    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 120) : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const confirm = typeof body.confirmPassword === 'string' ? body.confirmPassword : password;
    let email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    let username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';

    if (invite.email) {
      if (email && email !== invite.email) {
        return res.status(400).json({ error: 'Este convite está vinculado a outro e-mail.' });
      }
      email = invite.email;
    }

    if (!name) {
      return res.status(400).json({ error: 'Informe o seu nome.' });
    }
    if (!email && !username) {
      return res.status(400).json({ error: 'Informe um e-mail ou um nome de usuário.' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (username && !isValidUsername(username)) {
      return res.status(400).json({
        error: 'Usuário inválido. Use 3–30 caracteres: letras, números, . _ -',
      });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: PASSWORD_TOO_SHORT });
    }
    if (password !== confirm) {
      return res.status(400).json({ error: 'A confirmação não coincide com a senha.' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Informe um e-mail para criar o acesso.' });
    }

    const existing = await User.findOne({
      $or: [{ email }, ...(username ? [{ username }] : [])],
    }).select('churchId email username');

    if (existing) {
      if (String(existing.churchId) === String(invite.churchId)) {
        return res.status(409).json({ error: ALREADY_ON_TEAM });
      }
      return res.status(400).json({ error: ACCEPT_GENERIC });
    }

    if (!username) {
      username = await uniqueUsername(usernameFromEmail(email));
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const permissions = resolvePermissions(invite);
    const parsed = parseInviteToken(req.params.token);
    if (!parsed) return res.status(410).json({ error: INVITE_UNAVAILABLE });

    const session = await mongoose.startSession();
    let createdId: Types.ObjectId | undefined;

    try {
      await session.withTransaction(async () => {
        const consumed = await TeamInvitation.findOneAndUpdate(
          {
            _id: invite._id,
            churchId: invite.churchId,
            publicId: parsed.publicId,
            version: invite.version,
            status: 'pending',
            expiresAt: { $gt: new Date() },
          },
          {
            $set: {
              status: 'accepted',
              acceptedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { new: true, session }
        );
        if (!consumed) {
          throw new Error('INVITE_CONSUMED');
        }

        const [created] = await User.create(
          [
            {
              name,
              email,
              username,
              passwordHash,
              churchId: invite.churchId,
              role: invite.role,
              permissions: invite.permissionsCustomized ? permissions : [],
              permissionsCustomized: invite.permissionsCustomized === true,
              active: true,
              tokenVersion: 0,
              lastSeenAt: new Date(),
              ...(invite.email ? { emailVerifiedAt: new Date() } : {}),
            },
          ],
          { session }
        );
        createdId = created._id as Types.ObjectId;
        consumed.acceptedBy = {
          userId: createdId,
          churchId: invite.churchId,
          name,
        };
        await consumed.save({ session });
      });
    } catch (error) {
      if ((error as { message?: string }).message === 'INVITE_CONSUMED') {
        return res.status(409).json({ error: 'Este convite já foi utilizado.' });
      }
      if ((error as { code?: number }).code === 11000) {
        return res.status(400).json({ error: ACCEPT_GENERIC });
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (!createdId) {
      return res.status(500).json({ error: 'Não foi possível criar o acesso.' });
    }

    await TeamAuditEvent.create({
      churchId: invite.churchId,
      action: 'invite_accepted',
      targetUserId: createdId,
      targetInvitationId: invite._id,
      actor: { userId: createdId, churchId: invite.churchId, name },
    });

    const payload: AuthContext = {
      userId: String(createdId),
      churchId: String(invite.churchId),
      role: invite.role,
      name,
      email,
      permissions,
      tokenVersion: 0,
    };
    setSessionCookie(req, res, signToken(payload));
    return res.status(201).json({
      user: {
        id: String(createdId),
        name,
        email,
        username,
        churchName: church.name,
        role: invite.role,
        permissions,
      },
    });
  } catch (error) {
    if (isJwtSecretError(error)) {
      return res.status(503).json({ error: JWT_SECRET_HELP });
    }
    return res.status(500).json({ error: 'Não foi possível criar o acesso.' });
  }
});

export default router;
