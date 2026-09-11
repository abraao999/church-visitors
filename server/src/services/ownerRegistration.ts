import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { recordAuthAudit } from '../models/AuthAuditEvent.js';
import { PendingOwnerRegistration, type IPendingOwnerRegistration } from '../models/PendingOwnerRegistration.js';
import { User } from '../models/User.js';
import {
  getCodeMaxAttempts,
  getResendIntervalMs,
  getVerificationTtlMs,
} from '../utils/emailConfig.js';
import { createChurchSlug } from '../utils/church.js';
import {
  createHighEntropyToken,
  createOpaqueId,
  createVerificationCode,
  hashVerificationCode,
  hashVerificationToken,
  maskEmail,
  secretsMatch,
} from '../utils/emailCrypto.js';
import { EmailDeliveryError, sendOwnerVerificationEmail } from './authEmail.js';

export const EMAIL_CONFIRM_INVALID = 'Este link ou código não é válido.';
export const EMAIL_CONFIRM_EXPIRED = 'Este link ou código expirou.';
export const EMAIL_CONFIRM_USED = 'Este link ou código já foi utilizado.';
export const EMAIL_CONFIRM_UNAVAILABLE = 'Não foi possível confirmar agora. Tente novamente em instantes.';
export const EMAIL_CONFIRM_TOO_MANY = 'Muitas tentativas. Solicite um novo e-mail.';
export const EMAIL_RESEND_WAIT = 'Aguarde alguns instantes para pedir um novo e-mail.';

export type EmailConfirmCode = 'invalid' | 'expired' | 'used' | 'unavailable' | 'too_many';

export class EmailConfirmError extends Error {
  readonly code: EmailConfirmCode;
  readonly status: number;
  readonly resendAvailableAt?: string;

  constructor(
    code: EmailConfirmCode,
    message: string,
    status = 400,
    extras?: { resendAvailableAt?: string }
  ) {
    super(message);
    this.name = 'EmailConfirmError';
    this.code = code;
    this.status = status;
    this.resendAvailableAt = extras?.resendAvailableAt;
  }
}

export type PendingRegistrationPublic = {
  pending: true;
  challengeId: string;
  emailMasked: string;
  resendAvailableAt: string;
  expiresAt: string;
};

function ttlDates(now = Date.now()) {
  const verificationExpiresAt = new Date(now + getVerificationTtlMs());
  const resendAvailableAt = new Date(now + getResendIntervalMs());
  const deleteAfter = new Date(verificationExpiresAt.getTime() + 24 * 60 * 60 * 1000);
  return { verificationExpiresAt, resendAvailableAt, deleteAfter };
}

function createChallengeSecrets() {
  const challengeId = createOpaqueId();
  const token = createHighEntropyToken();
  const code = createVerificationCode();
  return {
    challengeId,
    token,
    code,
    verificationTokenHash: hashVerificationToken(token),
    verificationCodeHash: hashVerificationCode(challengeId, code),
  };
}

function publicPending(
  challengeId: string,
  email: string,
  resendAvailableAt: Date,
  expiresAt: Date
): PendingRegistrationPublic {
  return {
    pending: true,
    challengeId,
    emailMasked: maskEmail(email),
    resendAvailableAt: resendAvailableAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function createPendingOwnerRegistration(input: {
  churchName: string;
  name: string;
  email: string;
  username: string;
  passwordHash: string;
}): Promise<PendingRegistrationPublic> {
  const secrets = createChallengeSecrets();
  const dates = ttlDates();

  await PendingOwnerRegistration.deleteMany({
    $or: [{ email: input.email }, { username: input.username }],
  });

  await PendingOwnerRegistration.create({
    challengeId: secrets.challengeId,
    churchName: input.churchName,
    name: input.name,
    email: input.email,
    username: input.username,
    passwordHash: input.passwordHash,
    verificationTokenHash: secrets.verificationTokenHash,
    verificationCodeHash: secrets.verificationCodeHash,
    verificationExpiresAt: dates.verificationExpiresAt,
    resendAvailableAt: dates.resendAvailableAt,
    attemptCount: 0,
    deleteAfter: dates.deleteAfter,
  });

  try {
    await sendOwnerVerificationEmail({
      to: input.email,
      name: input.name,
      churchName: input.churchName,
      token: secrets.token,
      code: secrets.code,
      idempotencyKey: `verify-${secrets.challengeId}`,
    });
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  }

  return publicPending(
    secrets.challengeId,
    input.email,
    dates.resendAvailableAt,
    dates.verificationExpiresAt
  );
}

function pendingStatus(pending: IPendingOwnerRegistration | null, now: Date): EmailConfirmCode | null {
  if (!pending) return 'invalid';
  if (pending.consumedAt) return 'used';
  if (pending.verificationExpiresAt.getTime() <= now.getTime()) return 'expired';
  if (pending.attemptCount >= getCodeMaxAttempts()) return 'too_many';
  return null;
}

async function loadPendingForToken(token: string, now: Date): Promise<IPendingOwnerRegistration> {
  const tokenHash = hashVerificationToken(token);
  const pending = await PendingOwnerRegistration.findOne({ verificationTokenHash: tokenHash });
  const status = pendingStatus(pending, now);
  if (status === 'invalid') throw new EmailConfirmError('invalid', EMAIL_CONFIRM_INVALID);
  if (status === 'used') throw new EmailConfirmError('used', EMAIL_CONFIRM_USED);
  if (status === 'expired') throw new EmailConfirmError('expired', EMAIL_CONFIRM_EXPIRED);
  if (status === 'too_many') throw new EmailConfirmError('too_many', EMAIL_CONFIRM_TOO_MANY);
  return pending as IPendingOwnerRegistration;
}

async function loadPendingForCode(challengeId: string, code: string, now: Date): Promise<IPendingOwnerRegistration> {
  const pending = await PendingOwnerRegistration.findOne({ challengeId });
  const expected = pending
    ? pending.verificationCodeHash
    : hashVerificationCode(challengeId, '000000');
  const presented = hashVerificationCode(challengeId, code);
  const matched = secretsMatch(expected, presented);
  const status = pendingStatus(pending, now);

  if (!pending || status === 'invalid') {
    throw new EmailConfirmError('invalid', EMAIL_CONFIRM_INVALID);
  }
  if (status === 'used') throw new EmailConfirmError('used', EMAIL_CONFIRM_USED);
  if (status === 'expired') throw new EmailConfirmError('expired', EMAIL_CONFIRM_EXPIRED);
  if (status === 'too_many') throw new EmailConfirmError('too_many', EMAIL_CONFIRM_TOO_MANY);

  if (!matched) {
    const updated = await PendingOwnerRegistration.findOneAndUpdate(
      {
        _id: pending._id,
        consumedAt: null,
        attemptCount: { $lt: getCodeMaxAttempts() },
      },
      { $inc: { attemptCount: 1 } },
      { new: true }
    );
    if (!updated || updated.attemptCount >= getCodeMaxAttempts()) {
      await recordAuthAudit('email_code_locked');
      throw new EmailConfirmError('too_many', EMAIL_CONFIRM_TOO_MANY);
    }
    throw new EmailConfirmError('invalid', EMAIL_CONFIRM_INVALID);
  }

  return pending;
}

export async function confirmPendingOwnerRegistration(input: {
  token?: string;
  challengeId?: string;
  code?: string;
}): Promise<{
  user: {
    _id: Types.ObjectId;
    name: string;
    email: string;
    username: string;
    churchId: Types.ObjectId;
    role: 'owner';
    tokenVersion: number;
    emailVerifiedAt: Date;
  };
  churchName: string;
}> {
  const now = new Date();
  const token = input.token?.trim();
  const challengeId = input.challengeId?.trim();
  const code = input.code?.trim();
  const hasToken = Boolean(token);
  const hasCode = Boolean(challengeId && code);

  if (hasToken === hasCode) {
    throw new EmailConfirmError('invalid', EMAIL_CONFIRM_INVALID);
  }

  const pending = hasToken
    ? await loadPendingForToken(token as string, now)
    : await loadPendingForCode(challengeId as string, code as string, now);

  const session = await mongoose.startSession();
  let created:
    | {
        user: {
          _id: Types.ObjectId;
          name: string;
          email: string;
          username: string;
          churchId: Types.ObjectId;
          role: 'owner';
          tokenVersion: number;
          emailVerifiedAt: Date;
        };
        churchName: string;
      }
    | undefined;

  try {
    await session.withTransaction(async () => {
      const claimed = await PendingOwnerRegistration.findOneAndUpdate(
        {
          _id: pending._id,
          consumedAt: null,
          verificationExpiresAt: { $gt: now },
          attemptCount: { $lt: getCodeMaxAttempts() },
        },
        { $set: { consumedAt: now } },
        { session, new: true }
      );
      if (!claimed) {
        throw new EmailConfirmError('used', EMAIL_CONFIRM_USED);
      }

      const existing = await User.findOne(
        { $or: [{ email: claimed.email }, { username: claimed.username }] },
        null,
        { session }
      );
      if (existing) {
        throw new EmailConfirmError('used', EMAIL_CONFIRM_USED);
      }

      const emailVerifiedAt = new Date();
      const [church] = await Church.create(
        [{ name: claimed.churchName, slug: createChurchSlug(claimed.churchName), active: true }],
        { session }
      );
      const churchId = church._id as Types.ObjectId;
      const [user] = await User.create(
        [
          {
            name: claimed.name,
            email: claimed.email,
            username: claimed.username,
            passwordHash: claimed.passwordHash,
            churchId,
            role: 'owner',
            tokenVersion: 0,
            emailVerifiedAt,
          },
        ],
        { session }
      );

      await PendingOwnerRegistration.deleteOne({ _id: claimed._id }, { session });

      created = {
        user: {
          _id: user._id as Types.ObjectId,
          name: user.name,
          email: user.email,
          username: user.username || claimed.username,
          churchId,
          role: 'owner',
          tokenVersion: user.tokenVersion ?? 0,
          emailVerifiedAt,
        },
        churchName: claimed.churchName,
      };
    });
  } catch (error) {
    if (error instanceof EmailConfirmError) throw error;
    if ((error as { code?: number }).code === 11000) {
      throw new EmailConfirmError('used', EMAIL_CONFIRM_USED);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!created) {
    throw new EmailConfirmError('unavailable', EMAIL_CONFIRM_UNAVAILABLE, 503);
  }

  await recordAuthAudit('email_confirmed', {
    churchId: created.user.churchId,
    userId: created.user._id,
  });

  return created;
}

export async function resendPendingOwnerRegistration(challengeId: string): Promise<{
  ok: true;
  resendAvailableAt: string;
}> {
  const now = new Date();
  const generic = {
    ok: true as const,
    resendAvailableAt: new Date(now.getTime() + getResendIntervalMs()).toISOString(),
  };

  const pending = await PendingOwnerRegistration.findOne({ challengeId, consumedAt: null });
  if (!pending) {
    return generic;
  }

  if (pending.resendAvailableAt.getTime() > now.getTime()) {
    throw new EmailConfirmError('unavailable', EMAIL_RESEND_WAIT, 429, {
      resendAvailableAt: pending.resendAvailableAt.toISOString(),
    });
  }

  const existingUser = await User.findOne(
    { $or: [{ email: pending.email }, { username: pending.username }] },
    '_id'
  );
  if (existingUser) {
    await PendingOwnerRegistration.deleteOne({ _id: pending._id });
    return generic;
  }

  const token = createHighEntropyToken();
  const code = createVerificationCode();
  const dates = ttlDates(now.getTime());

  const updated = await PendingOwnerRegistration.findOneAndUpdate(
    {
      _id: pending._id,
      consumedAt: null,
      resendAvailableAt: { $lte: now },
    },
    {
      $set: {
        verificationTokenHash: hashVerificationToken(token),
        verificationCodeHash: hashVerificationCode(pending.challengeId, code),
        verificationExpiresAt: dates.verificationExpiresAt,
        resendAvailableAt: dates.resendAvailableAt,
        attemptCount: 0,
        deleteAfter: dates.deleteAfter,
      },
    },
    { new: true }
  );

  if (!updated) {
    return generic;
  }

  try {
    await sendOwnerVerificationEmail({
      to: pending.email,
      name: pending.name,
      churchName: pending.churchName,
      token,
      code,
      idempotencyKey: `verify-${pending.challengeId}-${dates.verificationExpiresAt.getTime()}`,
    });
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  }

  return {
    ok: true,
    resendAvailableAt: dates.resendAvailableAt.toISOString(),
  };
}
