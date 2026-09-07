import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { User, type IUser } from '../models/User.js';
import {
  isJwtSecretError,
  JWT_SECRET_HELP,
  requireAuth,
  revokeAuthTokens,
  signToken,
  type AuthenticatedRequest,
  type AuthContext,
} from '../middleware/auth.js';
import { requireAuthRateLimit } from '../middleware/authRateLimit.js';
import { publicChurchBranding, type PublicChurchBranding } from '../utils/branding.js';
import { createChurchSlug, normalizeChurchName } from '../utils/church.js';
import { readLoginIdentifier } from '../utils/loginIdentifier.js';
import { resolvePermissions, type Permission, type TeamRole } from '../utils/permissions.js';
import { clearSessionCookie, setSessionCookie } from '../utils/sessionCookie.js';

const router = Router();

/** Mesma frase para e-mail inválido e para e-mail/usuário já usados. */
export const REGISTER_GENERIC_ERROR =
  'Não foi possível criar a conta. Verifique os dados ou tente entrar.';

export const LOGIN_INVALID_ERROR = 'Credenciais inválidas';

/** Conta sem igreja e igreja inativa não devem ser distinguíveis após a senha. */
export const LOGIN_UNAVAILABLE_ERROR =
  'Não foi possível entrar agora. Fale com o administrador.';

const BCRYPT_ROUNDS = 10;
export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_TOO_SHORT = `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`;
let dummyPasswordHash: string | undefined;

function dummyHash(): string {
  dummyPasswordHash ??= bcrypt.hashSync('church-visitors-timing-dummy', BCRYPT_ROUNDS);
  return dummyPasswordHash;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicUser(
  user: {
    _id: unknown;
    name: string;
    email: string;
    username?: string;
    role?: TeamRole;
    permissions?: Permission[];
    permissionsCustomized?: boolean;
  },
  churchName: string,
  branding?: PublicChurchBranding
) {
  const role = user.role || 'owner';
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    username: user.username || undefined,
    churchName,
    role,
    permissions: resolvePermissions(user),
    branding: branding || { name: churchName },
  };
}

function issueSession(
  req: { secure?: boolean; get?: (name: string) => string | undefined },
  res: Response,
  user: {
    _id: unknown;
    name: string;
    email: string;
    username?: string;
    churchId: Types.ObjectId;
    role: TeamRole;
    permissions?: Permission[];
    permissionsCustomized?: boolean;
    tokenVersion?: number;
  },
  churchName: string,
  branding?: PublicChurchBranding
) {
  const payload: AuthContext = {
    userId: String(user._id),
    churchId: String(user.churchId),
    role: user.role,
    name: user.name,
    email: user.email,
    permissions: resolvePermissions(user),
    tokenVersion: user.tokenVersion ?? 0,
  };
  setSessionCookie(req, res, signToken(payload));
  return { user: publicUser(user, churchName, branding) };
}

export async function registerAccount(
  req: { body?: Record<string, unknown>; secure?: boolean; get?: (name: string) => string | undefined },
  res: Response
) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (body.churchId !== undefined) {
      return res.status(400).json({
        error: 'O identificador da igreja não deve ser enviado.',
      });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const churchName = normalizeChurchName(
      typeof body.churchName === 'string' ? body.churchName : ''
    );

    if (!name || !email || !username || !password || !churchName) {
      return res.status(400).json({
        error: 'Igreja, nome, e-mail, usuário e senha são obrigatórios',
      });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: PASSWORD_TOO_SHORT });
    }

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return res.status(400).json({
        error: 'Usuário inválido. Use 3–30 caracteres: letras, números, . _ -',
      });
    }

    // Hash sempre, inclusive quando o cadastro for recusado: o tempo de resposta
    // não deve denunciar se o e-mail já existe.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const existing = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (!isValidEmail(email) || existing) {
      return res.status(400).json({ error: REGISTER_GENERIC_ERROR });
    }

    const session = await mongoose.startSession();
    let user: IUser | undefined;
    let churchId: Types.ObjectId | undefined;

    try {
      await session.withTransaction(async () => {
        const [church] = await Church.create(
          [{ name: churchName, slug: createChurchSlug(churchName), active: true }],
          { session }
        );
        churchId = church._id as Types.ObjectId;

        const [createdUser] = await User.create(
          [{ name, email, username, passwordHash, churchId, role: 'owner', tokenVersion: 0 }],
          { session }
        );
        user = createdUser;
      });
    } finally {
      await session.endSession();
    }

    if (!user || !churchId) {
      throw new Error('Cadastro não concluído');
    }

    return res.status(201).json(
      issueSession(req, res, user as IUser & { churchId: Types.ObjectId }, churchName)
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(400).json({ error: REGISTER_GENERIC_ERROR });
    }
    if (isJwtSecretError(error)) {
      return res.status(503).json({ error: JWT_SECRET_HELP });
    }
    return res.status(500).json({ error: 'Erro ao criar conta' });
  }
}

export async function loginAccount(
  req: { body?: Record<string, unknown>; secure?: boolean; get?: (name: string) => string | undefined },
  res: Response
) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const login = readLoginIdentifier(body);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!login || !password) {
      return res.status(400).json({ error: 'Usuário/e-mail e senha são obrigatórios' });
    }

    const user = await User.findOne({
      $or: [{ email: login }, { username: login }],
    });

    const passwordHash = user?.passwordHash || dummyHash();
    const ok = await bcrypt.compare(password, passwordHash);
    if (!user?.passwordHash || !ok) {
      return res.status(401).json({ error: LOGIN_INVALID_ERROR });
    }

    if (!user.churchId || user.active === false) {
      return res.status(403).json({ error: LOGIN_UNAVAILABLE_ERROR });
    }

    const church = await Church.findOne({ _id: user.churchId, active: true }).select(
      'name branding.logoUrl branding.primaryColor branding.accentColor'
    );
    if (!church) {
      return res.status(403).json({ error: LOGIN_UNAVAILABLE_ERROR });
    }

    user.lastSeenAt = new Date();
    await user.save();

    return res.json(
      issueSession(
        req,
        res,
        user as IUser & { churchId: Types.ObjectId },
        church.name,
        publicChurchBranding(church)
      )
    );
  } catch (error) {
    if (isJwtSecretError(error)) {
      return res.status(503).json({ error: JWT_SECRET_HELP });
    }
    return res.status(500).json({ error: 'Erro ao entrar' });
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const nextPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword || !nextPassword) {
      return res.status(400).json({ error: 'Informe a senha atual e a nova senha' });
    }

    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: PASSWORD_TOO_SHORT });
    }

    if (currentPassword === nextPassword) {
      return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual' });
    }

    const user = await User.findOne({
      _id: req.auth!.userId,
      churchId: req.auth!.churchId,
    });

    const passwordHash = user?.passwordHash || dummyHash();
    const ok = await bcrypt.compare(currentPassword, passwordHash);
    if (!user?.passwordHash || !ok) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    const church = await Church.findOne({ _id: user.churchId, active: true }).select(
      'name branding.logoUrl branding.primaryColor branding.accentColor'
    );
    if (!church) {
      return res.status(403).json({ error: LOGIN_UNAVAILABLE_ERROR });
    }

    user.passwordHash = await bcrypt.hash(nextPassword, BCRYPT_ROUNDS);
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    return res.json(
      issueSession(
        req,
        res,
        user as IUser & { churchId: Types.ObjectId },
        church.name,
        publicChurchBranding(church)
      )
    );
  } catch (error) {
    if (isJwtSecretError(error)) {
      return res.status(503).json({ error: JWT_SECRET_HELP });
    }
    return res.status(500).json({ error: 'Erro ao alterar a senha' });
  }
}

export async function logoutAccount(req: AuthenticatedRequest, res: Response) {
  try {
    await revokeAuthTokens(req.auth!.userId, req.auth!.churchId);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erro ao sair' });
  }
}

router.post('/register', requireAuthRateLimit('register'), registerAccount);
router.post('/login', requireAuthRateLimit('login'), loginAccount);
router.post('/logout', requireAuth, logoutAccount);
router.post('/password', requireAuth, changePassword);

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findOne({
      _id: req.auth!.userId,
      churchId: req.auth!.churchId,
    }).select('name email username churchId role permissions permissionsCustomized active lastSeenAt');
    if (!user || user.active === false) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const church = await Church.findOne({ _id: req.auth!.churchId, active: true }).select(
      'name branding.logoUrl branding.primaryColor branding.accentColor'
    );
    if (!church) {
      return res.status(403).json({ error: 'O acesso desta igreja está indisponível.' });
    }

    user.lastSeenAt = new Date();
    await user.save();

    res.json({ user: publicUser(user, church.name, publicChurchBranding(church)) });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

export default router;
