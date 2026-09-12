import { Router, type Response } from 'express';
import { Types } from 'mongoose';
import {
  getPlatformAdminJwtSecret,
  isPlatformAdminJwtSecretError,
  PLATFORM_ADMIN_JWT_SECRET_HELP,
  requirePlatformAdmin,
  requirePlatformRole,
  signPlatformAdminToken,
  type PlatformAdminRequest,
} from '../middleware/platformAdminAuth.js';
import { recordPlatformAudit } from '../models/PlatformAuditEvent.js';
import { EmailDeliveryError } from '../services/authEmail.js';
import { EmailConfirmError } from '../services/ownerRegistration.js';
import { PasswordResetError } from '../services/passwordReset.js';
import {
  authenticatePlatformAdmin,
  createAssistedChurch,
  getPlatformChurchDetail,
  listPlatformChurches,
  loadPlatformAdminOverview,
  PLATFORM_CHURCH_NOT_FOUND,
  PLATFORM_FORBIDDEN,
  PLATFORM_LOGIN_INVALID,
  PLATFORM_LOGIN_UNAVAILABLE,
  reactivatePlatformChurch,
  resendPlatformVerification,
  sendPlatformPasswordReset,
  suspendPlatformChurch,
} from '../services/platformAdmin.js';
import { clientIp, consumeRateLimit, sendRateLimited } from '../utils/rateLimit.js';
import { normalizeEmail } from '../utils/emailCrypto.js';
import { isEmailTokenSecretError, EMAIL_TOKEN_SECRET_HELP } from '../utils/emailConfig.js';
import { clearPlatformAdminCookie, setPlatformAdminCookie } from '../utils/platformAdminSession.js';

const router = Router();
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_ID_LIMIT = 10;
const LOGIN_LIMIT_MESSAGE = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';

function publicAdmin(admin: { adminId: string; name: string; email: string; role: string }) {
  return {
    id: admin.adminId,
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };
}

function readChurchId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function rejectChurchIdFromClient(body: Record<string, unknown> | undefined, paramId: string): string | undefined {
  if (body && 'churchId' in body && String(body.churchId) !== paramId) {
    return 'O identificador da igreja não deve ser enviado no corpo.';
  }
  return undefined;
}

export async function requireAdminLoginLimit(req: PlatformAdminRequest, res: Response): Promise<boolean> {
  try {
    const secret = getPlatformAdminJwtSecret();
    const ip = clientIp(req);
    const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
    if (!(await consumeRateLimit(secret, 'platform-admin-login-ip', ip, LOGIN_IP_LIMIT))) {
      await recordPlatformAudit({ operation: 'login_blocked', metadata: { by: 'ip' } });
      sendRateLimited(res, { error: LOGIN_LIMIT_MESSAGE });
      return false;
    }
    if (email && !(await consumeRateLimit(secret, 'platform-admin-login-id', email, LOGIN_ID_LIMIT))) {
      await recordPlatformAudit({ operation: 'login_blocked', metadata: { by: 'id' } });
      sendRateLimited(res, { error: LOGIN_LIMIT_MESSAGE });
      return false;
    }
    return true;
  } catch (error) {
    if (isPlatformAdminJwtSecretError(error)) {
      res.status(503).json({ error: PLATFORM_ADMIN_JWT_SECRET_HELP });
      return false;
    }
    throw error;
  }
}

router.post('/auth/login', async (req: PlatformAdminRequest, res) => {
  if (!(await requireAdminLoginLimit(req, res))) return;
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!email || !password) {
    return res.status(401).json({ error: PLATFORM_LOGIN_INVALID });
  }
  try {
    const admin = await authenticatePlatformAdmin(email, password);
    const token = signPlatformAdminToken(admin);
    setPlatformAdminCookie(req, res, token);
    await recordPlatformAudit({
      platformAdminId: new Types.ObjectId(admin.adminId),
      platformAdminName: admin.name,
      platformAdminRole: admin.role,
      operation: 'login_succeeded',
    });
    return res.json({ admin: publicAdmin(admin) });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid') {
      return res.status(401).json({ error: PLATFORM_LOGIN_INVALID });
    }
    if (isPlatformAdminJwtSecretError(error)) {
      return res.status(503).json({ error: PLATFORM_ADMIN_JWT_SECRET_HELP });
    }
    return res.status(503).json({ error: PLATFORM_LOGIN_UNAVAILABLE });
  }
});

router.post('/auth/logout', requirePlatformAdmin, async (req: PlatformAdminRequest, res) => {
  const admin = req.platformAdmin;
  if (admin) {
    await recordPlatformAudit({
      platformAdminId: new Types.ObjectId(admin.adminId),
      platformAdminName: admin.name,
      platformAdminRole: admin.role,
      operation: 'logout',
    });
  }
  clearPlatformAdminCookie(req, res);
  return res.json({ ok: true });
});

router.get('/auth/me', requirePlatformAdmin, async (req: PlatformAdminRequest, res) => {
  return res.json({ admin: publicAdmin(req.platformAdmin!) });
});

router.get('/overview', requirePlatformAdmin, async (_req, res) => {
  try {
    return res.json(await loadPlatformAdminOverview());
  } catch {
    return res.status(503).json({ error: 'Não foi possível carregar a visão geral.' });
  }
});

router.get('/churches', requirePlatformAdmin, async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const situacao = typeof req.query.situacao === 'string' ? req.query.situacao : '';
    const page = Number(req.query.page);
    const pageSize = Number(req.query.pageSize);
    return res.json(
      await listPlatformChurches({
        q,
        situacao,
        page: Number.isInteger(page) ? page : 1,
        pageSize: Number.isInteger(pageSize) ? pageSize : 20,
      })
    );
  } catch {
    return res.status(503).json({ error: 'Não foi possível carregar as igrejas.' });
  }
});

router.post('/churches', requirePlatformAdmin, requirePlatformRole('platform_owner', 'support'), async (req: PlatformAdminRequest, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const pending = await createAssistedChurch(
      {
        churchName: typeof body.churchName === 'string' ? body.churchName : '',
        ownerName: typeof body.ownerName === 'string' ? body.ownerName : '',
        ownerEmail: typeof body.ownerEmail === 'string' ? body.ownerEmail : '',
        city: typeof body.city === 'string' ? body.city : '',
      },
      req.platformAdmin!
    );
    return res.status(201).json(pending);
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid') {
      return res.status(400).json({ error: 'Informe o nome da igreja, o nome e um e-mail válido do proprietário.' });
    }
    if (error instanceof Error && error.message === 'duplicate') {
      return res.status(400).json({ error: 'Já existe uma conta com este e-mail.' });
    }
    if (error instanceof EmailDeliveryError) {
      return res.status(503).json({ error: error.message });
    }
    if (isEmailTokenSecretError(error)) {
      return res.status(503).json({ error: EMAIL_TOKEN_SECRET_HELP });
    }
    return res.status(503).json({ error: 'Não foi possível cadastrar a igreja agora.' });
  }
});

router.get('/churches/:churchId', requirePlatformAdmin, async (req, res) => {
  try {
    return res.json(await getPlatformChurchDetail(readChurchId(req.params.churchId)));
  } catch (error) {
    if (error instanceof Error && error.message === 'not_found') {
      return res.status(404).json({ error: PLATFORM_CHURCH_NOT_FOUND });
    }
    return res.status(503).json({ error: 'Não foi possível carregar a igreja.' });
  }
});

router.post('/churches/:churchId/suspend', requirePlatformAdmin, requirePlatformRole('platform_owner'), async (req: PlatformAdminRequest, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const churchId = readChurchId(req.params.churchId);
  const tenantError = rejectChurchIdFromClient(body, churchId);
  if (tenantError) return res.status(400).json({ error: tenantError });
  try {
    await suspendPlatformChurch(
      churchId,
      typeof body.reason === 'string' ? body.reason : '',
      typeof body.confirmName === 'string' ? body.confirmName : '',
      req.platformAdmin!
    );
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'not_found') {
      return res.status(404).json({ error: PLATFORM_CHURCH_NOT_FOUND });
    }
    if (error instanceof Error && error.message === 'reason') {
      return res.status(400).json({ error: 'Informe o motivo da suspensão.' });
    }
    if (error instanceof Error && error.message === 'confirm') {
      return res.status(400).json({ error: 'Digite o nome da igreja para confirmar.' });
    }
    return res.status(503).json({ error: 'Não foi possível suspender a igreja.' });
  }
});

router.post('/churches/:churchId/reactivate', requirePlatformAdmin, requirePlatformRole('platform_owner'), async (req: PlatformAdminRequest, res) => {
  const churchId = readChurchId(req.params.churchId);
  const tenantError = rejectChurchIdFromClient(
    req.body && typeof req.body === 'object' ? req.body : {},
    churchId
  );
  if (tenantError) return res.status(400).json({ error: tenantError });
  try {
    await reactivatePlatformChurch(churchId, req.platformAdmin!);
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'not_found') {
      return res.status(404).json({ error: PLATFORM_CHURCH_NOT_FOUND });
    }
    return res.status(503).json({ error: 'Não foi possível reativar a igreja.' });
  }
});

router.post(
  '/churches/:churchId/send-password-reset',
  requirePlatformAdmin,
  requirePlatformRole('platform_owner', 'support'),
  async (req: PlatformAdminRequest, res) => {
    try {
      await sendPlatformPasswordReset(readChurchId(req.params.churchId), req.platformAdmin!);
      return res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'not_found') {
        return res.status(404).json({ error: PLATFORM_CHURCH_NOT_FOUND });
      }
      if (error instanceof EmailDeliveryError || error instanceof PasswordResetError) {
        return res.status(503).json({ error: 'Não foi possível enviar a redefinição de senha.' });
      }
      return res.status(503).json({ error: 'Não foi possível enviar a redefinição de senha.' });
    }
  }
);

router.post(
  '/churches/:churchId/resend-verification',
  requirePlatformAdmin,
  requirePlatformRole('platform_owner', 'support'),
  async (req: PlatformAdminRequest, res) => {
    try {
      await resendPlatformVerification(readChurchId(req.params.churchId), req.platformAdmin!);
      return res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'not_found') {
        return res.status(404).json({ error: PLATFORM_CHURCH_NOT_FOUND });
      }
      if (error instanceof Error && error.message === 'already_verified') {
        return res.status(400).json({ error: 'O e-mail do proprietário já está confirmado.' });
      }
      if (error instanceof Error && error.message === 'no_pending') {
        return res.status(400).json({ error: 'Não há confirmação pendente para reenviar.' });
      }
      if (error instanceof EmailConfirmError) {
        return res.status(error.status).json({ error: error.message });
      }
      if (error instanceof EmailDeliveryError) {
        return res.status(503).json({ error: error.message });
      }
      return res.status(503).json({ error: 'Não foi possível reenviar a confirmação.' });
    }
  }
);

router.use((_req, res) => {
  res.status(403).json({ error: PLATFORM_FORBIDDEN });
});

export default router;
