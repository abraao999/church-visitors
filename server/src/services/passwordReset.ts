import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { EmailActionToken } from '../models/EmailActionToken.js';
import { recordAuthAudit } from '../models/AuthAuditEvent.js';
import { User } from '../models/User.js';
import { getPasswordResetTtlMs } from '../utils/emailConfig.js';
import {
  createHighEntropyToken,
  hashPasswordResetToken,
} from '../utils/emailCrypto.js';
import { EmailDeliveryError, sendPasswordResetEmail } from './authEmail.js';

export const PASSWORD_FORGOT_MESSAGE =
  'Se existir uma conta para este e-mail, enviaremos as instruções.';

export const PASSWORD_RESET_INVALID = 'Este link não é válido.';
export const PASSWORD_RESET_EXPIRED = 'Este link expirou.';
export const PASSWORD_RESET_USED = 'Este link já foi utilizado.';
export const PASSWORD_RESET_UNAVAILABLE =
  'Não foi possível redefinir a senha agora. Tente novamente em instantes.';
export const PASSWORD_RESET_SAME = 'A nova senha precisa ser diferente da atual.';
export const PASSWORD_RESET_MISMATCH = 'A confirmação não coincide com a nova senha.';

export type PasswordResetStatus = 'valid' | 'invalid' | 'expired' | 'used';

export class PasswordResetError extends Error {
  readonly code: PasswordResetStatus | 'unavailable' | 'same' | 'mismatch';
  readonly status: number;

  constructor(
    code: PasswordResetStatus | 'unavailable' | 'same' | 'mismatch',
    message: string,
    status = 400
  ) {
    super(message);
    this.name = 'PasswordResetError';
    this.code = code;
    this.status = status;
  }
}

const BCRYPT_ROUNDS = 10;
let dummyPasswordHash: string | undefined;

function dummyHash(): string {
  dummyPasswordHash ??= bcrypt.hashSync('church-visitors-timing-dummy', BCRYPT_ROUNDS);
  return dummyPasswordHash;
}

async function equalizeForgotTiming(passwordHash?: string): Promise<void> {
  await bcrypt.compare('forgot-timing', passwordHash || dummyHash());
}

function ttlDates(now = Date.now()) {
  const expiresAt = new Date(now + getPasswordResetTtlMs());
  const deleteAfter = new Date(expiresAt.getTime() + 24 * 60 * 60 * 1000);
  return { expiresAt, deleteAfter };
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const now = new Date();
  const token = createHighEntropyToken();
  const tokenHash = hashPasswordResetToken(token);

  const user = await User.findOne(
    { email },
    'name email passwordHash churchId active emailVerifiedAt'
  );
  await equalizeForgotTiming(user?.passwordHash);

  const eligible =
    Boolean(user?.passwordHash) &&
    user?.active !== false &&
    Boolean(user?.churchId);

  let churchName = '';
  if (eligible && user?.churchId) {
    const church = await Church.findOne({ _id: user.churchId, active: true }, 'name');
    if (church) {
      churchName = church.name;
    }
  }

  await recordAuthAudit('password_reset_requested');

  if (!eligible || !user || !churchName) {
    return { message: PASSWORD_FORGOT_MESSAGE };
  }

  const dates = ttlDates(now.getTime());
  await EmailActionToken.updateMany(
    {
      userId: user._id,
      churchId: user.churchId,
      purpose: 'password_reset',
      usedAt: null,
    },
    { $set: { usedAt: now } }
  );
  await recordAuthAudit('tokens_invalidated', {
    churchId: user.churchId as Types.ObjectId,
    userId: user._id as Types.ObjectId,
  });

  await EmailActionToken.create({
    purpose: 'password_reset',
    userId: user._id,
    churchId: user.churchId,
    tokenHash,
    expiresAt: dates.expiresAt,
    deleteAfter: dates.deleteAfter,
  });

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      churchName,
      token,
      idempotencyKey: `reset-${String(user._id)}-${dates.expiresAt.getTime()}`,
    });
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  }

  return { message: PASSWORD_FORGOT_MESSAGE };
}

export async function requestPasswordResetForOwner(userId: Types.ObjectId): Promise<void> {
  const now = new Date();
  const user = await User.findById(userId, 'name email passwordHash churchId active');
  if (!user?.passwordHash || user.active === false || !user.churchId) {
    throw new PasswordResetError('unavailable', PASSWORD_RESET_UNAVAILABLE, 503);
  }

  const church = await Church.findById(user.churchId, 'name');
  if (!church) {
    throw new PasswordResetError('unavailable', PASSWORD_RESET_UNAVAILABLE, 503);
  }

  const token = createHighEntropyToken();
  const tokenHash = hashPasswordResetToken(token);
  const dates = ttlDates(now.getTime());
  await EmailActionToken.updateMany(
    {
      userId: user._id,
      churchId: user.churchId,
      purpose: 'password_reset',
      usedAt: null,
    },
    { $set: { usedAt: now } }
  );
  await EmailActionToken.create({
    purpose: 'password_reset',
    userId: user._id,
    churchId: user.churchId,
    tokenHash,
    expiresAt: dates.expiresAt,
    deleteAfter: dates.deleteAfter,
  });
  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    churchName: church.name,
    token,
    idempotencyKey: `admin-reset-${String(user._id)}-${dates.expiresAt.getTime()}`,
  });
}

export async function inspectPasswordResetToken(token: string): Promise<{ status: PasswordResetStatus }> {
  const tokenHash = hashPasswordResetToken(token);
  const record = await EmailActionToken.findOne({
    tokenHash,
    purpose: 'password_reset',
  });
  if (!record) return { status: 'invalid' };
  if (record.usedAt) return { status: 'used' };
  if (record.expiresAt.getTime() <= Date.now()) return { status: 'expired' };
  return { status: 'valid' };
}

export async function completePasswordReset(input: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<void> {
  if (input.newPassword !== input.confirmPassword) {
    throw new PasswordResetError('mismatch', PASSWORD_RESET_MISMATCH);
  }

  const now = new Date();
  const tokenHash = hashPasswordResetToken(input.token);
  const preview = await EmailActionToken.findOne({ tokenHash, purpose: 'password_reset' });
  if (!preview) {
    throw new PasswordResetError('invalid', PASSWORD_RESET_INVALID);
  }
  if (preview.usedAt) {
    throw new PasswordResetError('used', PASSWORD_RESET_USED);
  }
  if (preview.expiresAt.getTime() <= now.getTime()) {
    throw new PasswordResetError('expired', PASSWORD_RESET_EXPIRED);
  }

  const user = await User.findOne({
    _id: preview.userId,
    churchId: preview.churchId,
  });
  const church = user?.churchId
    ? await Church.findOne({ _id: preview.churchId, active: true }, '_id')
    : null;

  if (!user || user.active === false || !user.passwordHash || !church) {
    throw new PasswordResetError('unavailable', PASSWORD_RESET_UNAVAILABLE, 403);
  }

  const reused = await bcrypt.compare(input.newPassword, user.passwordHash);
  if (reused) {
    throw new PasswordResetError('same', PASSWORD_RESET_SAME);
  }

  const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const consumed = await EmailActionToken.findOneAndUpdate(
        {
          _id: preview._id,
          userId: preview.userId,
          churchId: preview.churchId,
          purpose: 'password_reset',
          usedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { usedAt: now } },
        { session, new: true }
      );
      if (!consumed) {
        throw new PasswordResetError('used', PASSWORD_RESET_USED);
      }

      const lockedUser = await User.findOne(
        { _id: consumed.userId, churchId: consumed.churchId, active: true },
        null,
        { session }
      );
      const lockedChurch = await Church.findOne(
        { _id: consumed.churchId, active: true },
        '_id',
        { session }
      );
      if (!lockedUser?.passwordHash || !lockedChurch) {
        throw new PasswordResetError('unavailable', PASSWORD_RESET_UNAVAILABLE, 403);
      }

      lockedUser.passwordHash = passwordHash;
      lockedUser.tokenVersion = (lockedUser.tokenVersion ?? 0) + 1;
      if (!lockedUser.emailVerifiedAt) {
        lockedUser.emailVerifiedAt = now;
      }
      await lockedUser.save({ session });

      await EmailActionToken.updateMany(
        {
          userId: consumed.userId,
          churchId: consumed.churchId,
          purpose: 'password_reset',
          usedAt: null,
          _id: { $ne: consumed._id },
        },
        { $set: { usedAt: now } },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  await recordAuthAudit('password_reset_completed', {
    churchId: preview.churchId,
    userId: preview.userId,
  });
  await recordAuthAudit('tokens_invalidated', {
    churchId: preview.churchId,
    userId: preview.userId,
  });
}
