import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
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
import { EmailDeliveryError } from '../services/authEmail.js';
import {
  EmailConfirmError,
  confirmPendingOwnerRegistration,
  createPendingOwnerRegistration,
  resendPendingOwnerRegistration,
} from '../services/ownerRegistration.js';
import {
  PasswordResetError,
  completePasswordReset,
  inspectPasswordResetToken,
  requestPasswordReset,
  requestPasswordResetForOwner,
} from '../services/passwordReset.js';
import { publicChurchBranding, type PublicChurchBranding } from '../utils/branding.js';
import { normalizeChurchName } from '../utils/church.js';
import { isEmailTokenSecretError, EMAIL_TOKEN_SECRET_HELP } from '../utils/emailConfig.js';
import { maskEmail, normalizeEmail } from '../utils/emailCrypto.js';
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
  branding?: PublicChurchBranding,
  visitorFollowUpEnabled = false
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
    visitorFollowUpEnabled: visitorFollowUpEnabled === true,
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
  branding?: PublicChurchBranding,
  visitorFollowUpEnabled = false
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
  return { user: publicUser(user, churchName, branding, visitorFollowUpEnabled) };
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

    const pending = await createPendingOwnerRegistration({
      churchName,
      name,
      email,
      username,
      passwordHash,
    });

    return res.status(201).json(pending);
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      return res.status(503).json({ error: error.message });
    }
    if ((error as { code?: number }).code === 11000) {
      return res.status(400).json({ error: REGISTER_GENERIC_ERROR });
    }
    if (isJwtSecretError(error)) {
      return res.status(503).json({ error: JWT_SECRET_HELP });
    }
    if (isEmailTokenSecretError(error)) {
      return res.status(503).json({ error: EMAIL_TOKEN_SECRET_HELP });
    }
    return res.status(500).json({ error: 'Erro ao criar conta' });
  }
}

function rejectClientTenantIds(body: Record<string, unknown>): string | undefined {
  if (body.churchId !== undefined) {
    return 'O identificador da igreja não deve ser enviado.';
  }
  if (body.userId !== undefined) {
    return 'O identificador do usuário não deve ser enviado.';
  }
  return undefined;
}

function sendConfirmError(res: Response, error: EmailConfirmError) {
  return res.status(error.status).json({
    error: error.message,
    code: error.code,
    ...(error.resendAvailableAt ? { resendAvailableAt: error.resendAvailableAt } : {}),
  });
}

export async function confirmOwnerEmail(
  req: { body?: Record<string, unknown>; secure?: boolean; get?: (name: string) => string | undefined },
  res: Response
) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenantError = rejectClientTenantIds(body);
    if (tenantError) {
      return res.status(400).json({ error: tenantError });
    }

    const token = typeof body.token === 'string' ? body.token : undefined;
    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : undefined;
    const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : undefined;

    const created = await confirmPendingOwnerRegistration({ token, challengeId, code });
    if (created.assisted) {
      try {
        await requestPasswordResetForOwner(created.user._id);
      } catch {
        // A conta já existe; o painel pode reenviar a redefinição.
      }
      return res.status(201).json({
        needsPassword: true,
        emailMasked: maskEmail(created.user.email),
      });
    }
    return res.status(201).json(
      issueSession(
        req,
        res,
        created.user,
        created.churchName
      )
    );
  } catch (error) {
    if (error instanceof EmailConfirmError) {
      return sendConfirmError(res, error);
    }
    if (isJwtSecretError(error)) {
      return res.status(503).json({ error: JWT_SECRET_HELP });
    }
    if (isEmailTokenSecretError(error)) {
      return res.status(503).json({ error: EMAIL_TOKEN_SECRET_HELP });
    }
    return res.status(503).json({
      error: 'Não foi possível confirmar agora. Tente novamente em instantes.',
      code: 'unavailable',
    });
  }
}

export async function resendOwnerEmail(
  req: { body?: Record<string, unknown> },
  res: Response
) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenantError = rejectClientTenantIds(body);
    if (tenantError) {
      return res.status(400).json({ error: tenantError });
    }

    const challengeId = typeof body.challengeId === 'string' ? body.challengeId.trim() : '';
    if (!challengeId) {
      return res.json({ ok: true, resendAvailableAt: new Date(Date.now() + 60_000).toISOString() });
    }

    const result = await resendPendingOwnerRegistration(challengeId);
    return res.json(result);
  } catch (error) {
    if (error instanceof EmailConfirmError) {
      return sendConfirmError(res, error);
    }
    if (error instanceof EmailDeliveryError) {
      return res.status(503).json({ error: error.message, code: 'unavailable' });
    }
    if (isEmailTokenSecretError(error)) {
      return res.status(503).json({ error: EMAIL_TOKEN_SECRET_HELP, code: 'unavailable' });
    }
    return res.status(503).json({
      error: 'Não foi possível reenviar agora. Tente novamente em instantes.',
      code: 'unavailable',
    });
  }
}

export async function forgotPasswordAccount(
  req: { body?: Record<string, unknown> },
  res: Response
) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenantError = rejectClientTenantIds(body);
    if (tenantError) {
      return res.status(400).json({ error: tenantError });
    }

    const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
    if (!email || !isValidEmail(email)) {
      return res.json({ message: 'Se existir uma conta para este e-mail, enviaremos as instruções.' });
    }

    const result = await requestPasswordReset(email);
    return res.json(result);
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      return res.status(503).json({ error: error.message });
    }
    if (isEmailTokenSecretError(error)) {
      return res.status(503).json({ error: EMAIL_TOKEN_SECRET_HELP });
    }
    return res.status(503).json({ error: 'Não foi possível enviar as instruções agora.' });
  }
}

export async function inspectPasswordReset(
  req: { body?: Record<string, unknown> },
  res: Response
) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenantError = rejectClientTenantIds(body);
    if (tenantError) {
      return res.status(400).json({ error: tenantError });
    }
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return res.json({ status: 'invalid' });
    }
    return res.json(await inspectPasswordResetToken(token));
  } catch (error) {
    if (isEmailTokenSecretError(error)) {
      return res.status(503).json({ error: EMAIL_TOKEN_SECRET_HELP, status: 'invalid' });
    }
    return res.json({ status: 'invalid' });
  }
}

export async function resetPasswordAccount(
  req: { body?: Record<string, unknown> },
  res: Response
) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tenantError = rejectClientTenantIds(body);
    if (tenantError) {
      return res.status(400).json({ error: tenantError });
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

    if (!token) {
      return res.status(400).json({ error: 'Este link não é válido.', code: 'invalid' });
    }
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Informe a nova senha e a confirmação.' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: PASSWORD_TOO_SHORT });
    }

    await completePasswordReset({ token, newPassword, confirmPassword });
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    if (isEmailTokenSecretError(error)) {
      return res.status(503).json({ error: EMAIL_TOKEN_SECRET_HELP, code: 'unavailable' });
    }
    return res.status(503).json({
      error: 'Não foi possível redefinir a senha agora. Tente novamente em instantes.',
      code: 'unavailable',
    });
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
      'name visitorFollowUpEnabled branding.logoUrl branding.primaryColor branding.accentColor'
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
        publicChurchBranding(church),
        church.visitorFollowUpEnabled === true
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
      'name visitorFollowUpEnabled branding.logoUrl branding.primaryColor branding.accentColor'
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
        publicChurchBranding(church),
        church.visitorFollowUpEnabled === true
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
router.post('/password/forgot', requireAuthRateLimit('password-forgot'), forgotPasswordAccount);
router.post('/password/reset/inspect', requireAuthRateLimit('password-reset'), inspectPasswordReset);
router.post('/password/reset', requireAuthRateLimit('password-reset'), resetPasswordAccount);
router.post('/password', requireAuth, changePassword);
router.post('/email/confirm', requireAuthRateLimit('email-confirm'), confirmOwnerEmail);
router.post('/email/resend', requireAuthRateLimit('email-resend'), resendOwnerEmail);

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
      'name visitorFollowUpEnabled branding.logoUrl branding.primaryColor branding.accentColor'
    );
    if (!church) {
      return res.status(403).json({ error: 'O acesso desta igreja está indisponível.' });
    }

    user.lastSeenAt = new Date();
    await user.save();

    res.json({
      user: publicUser(
        user,
        church.name,
        publicChurchBranding(church),
        church.visitorFollowUpEnabled === true
      ),
    });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

export default router;
