import { Resend } from 'resend';
import {
  buildEmailActionLink,
  getEmailFrom,
  getEmailReplyTo,
  getPasswordResetTtlMs,
  getVerificationTtlMs,
} from '../utils/emailConfig.js';

export class EmailDeliveryError extends Error {
  constructor() {
    super('Não foi possível enviar o e-mail agora. Tente novamente em instantes.');
    this.name = 'EmailDeliveryError';
  }
}

export type OwnerVerificationEmailInput = {
  to: string;
  name: string;
  churchName: string;
  token: string;
  code: string;
  idempotencyKey: string;
};

export type PasswordResetEmailInput = {
  to: string;
  name: string;
  churchName: string;
  token: string;
  idempotencyKey: string;
};

export type AuthEmailSender = {
  sendOwnerVerificationEmail(input: OwnerVerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void>;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeText(value: string): string {
  return value.replace(/[\r\n\0]/g, ' ').replace(/\s+/g, ' ').trim();
}

function minutesLabel(ms: number): string {
  return String(Math.max(1, Math.round(ms / 60000)));
}

export function renderOwnerVerificationEmail(input: {
  name: string;
  churchName: string;
  confirmUrl: string;
  code: string;
  ttlMinutes: string;
}): { subject: string; html: string; text: string } {
  const name = safeText(input.name);
  const churchName = safeText(input.churchName);
  const code = safeText(input.code);
  const subject = 'Confirme seu e-mail — Eclesiafy';
  const text = [
    `Olá, ${name}.`,
    `Recebemos o cadastro da ${churchName} na Eclesiafy.`,
    `Confirme seu e-mail neste link: ${input.confirmUrl}`,
    `Ou use o código: ${code}`,
    `O link e o código expiram em ${input.ttlMinutes} minutos.`,
    'Se você não pediu este cadastro, ignore esta mensagem.',
  ].join('\n\n');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Georgia,serif;color:#292524;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffaf3;border:1px solid #e7e0d4;border-radius:16px;padding:32px 28px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b45309;">Eclesiafy</p>
              <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;">Confirme seu e-mail</h1>
              <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Olá, ${escapeHtml(name)}.</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">Recebemos o cadastro da <strong>${escapeHtml(churchName)}</strong>. Toque no botão para confirmar que este e-mail é seu.</p>
              <p style="margin:0 0 24px;">
                <a href="${escapeHtml(input.confirmUrl)}" style="display:inline-block;background:#b45309;color:#fffaf3;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;">Confirmar meu e-mail</a>
              </p>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Se preferir, use este código de seis dígitos:</p>
              <p style="margin:0 0 20px;font-size:28px;letter-spacing:.28em;font-weight:700;">${escapeHtml(code)}</p>
              <p style="margin:0 0 12px;font-size:14px;color:#57534e;">O link e o código expiram em ${escapeHtml(input.ttlMinutes)} minutos.</p>
              <p style="margin:0;font-size:14px;color:#57534e;">Se você não pediu este cadastro, ignore esta mensagem.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

export function renderPasswordResetEmail(input: {
  name: string;
  churchName: string;
  resetUrl: string;
  ttlMinutes: string;
}): { subject: string; html: string; text: string } {
  const name = safeText(input.name);
  const churchName = safeText(input.churchName);
  const subject = 'Redefinição de senha — Eclesiafy';
  const text = [
    `Olá, ${name}.`,
    `Recebemos um pedido para redefinir a senha da sua conta na ${churchName}.`,
    `Crie uma nova senha neste link: ${input.resetUrl}`,
    `Este link expira em ${input.ttlMinutes} minutos.`,
    'Se você não pediu esta alteração, ignore esta mensagem. Sua senha atual continua valendo.',
  ].join('\n\n');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Georgia,serif;color:#292524;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffaf3;border:1px solid #e7e0d4;border-radius:16px;padding:32px 28px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b45309;">Eclesiafy</p>
              <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;">Redefinição de senha</h1>
              <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Olá, ${escapeHtml(name)}.</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">Recebemos um pedido para redefinir a senha da sua conta na <strong>${escapeHtml(churchName)}</strong>.</p>
              <p style="margin:0 0 24px;">
                <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#b45309;color:#fffaf3;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;">Criar uma nova senha</a>
              </p>
              <p style="margin:0 0 12px;font-size:14px;color:#57534e;">Este link expira em ${escapeHtml(input.ttlMinutes)} minutos.</p>
              <p style="margin:0;font-size:14px;color:#57534e;">Se você não pediu esta alteração, ignore esta mensagem.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function createResendClient(): Resend {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new EmailDeliveryError();
  }
  return new Resend(apiKey);
}

async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}): Promise<void> {
  try {
    const resend = createResendClient();
    const replyTo = getEmailReplyTo();
    const result = await resend.emails.send(
      {
        from: getEmailFrom(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(replyTo ? { replyTo } : {}),
        headers: {
          'X-Entity-Ref-ID': input.idempotencyKey,
        },
        tags: [
          { name: 'category', value: 'transactional' },
          { name: 'tracking', value: 'off' },
        ],
      },
      { idempotencyKey: input.idempotencyKey }
    );
    if (result.error) {
      console.error('Falha ao enviar e-mail transacional');
      throw new EmailDeliveryError();
    }
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    console.error('Falha ao enviar e-mail transacional');
    throw new EmailDeliveryError();
  }
}

const resendSender: AuthEmailSender = {
  async sendOwnerVerificationEmail(input) {
    const confirmUrl = buildEmailActionLink('/confirmar-email', input.token);
    const rendered = renderOwnerVerificationEmail({
      name: input.name,
      churchName: input.churchName,
      confirmUrl,
      code: input.code,
      ttlMinutes: minutesLabel(getVerificationTtlMs()),
    });
    await sendTransactionalEmail({
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: input.idempotencyKey,
    });
  },

  async sendPasswordResetEmail(input) {
    const resetUrl = buildEmailActionLink('/redefinir-senha', input.token);
    const rendered = renderPasswordResetEmail({
      name: input.name,
      churchName: input.churchName,
      resetUrl,
      ttlMinutes: minutesLabel(getPasswordResetTtlMs()),
    });
    await sendTransactionalEmail({
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: input.idempotencyKey,
    });
  },
};

let currentSender: AuthEmailSender = resendSender;

export function setAuthEmailSender(sender: AuthEmailSender | null): void {
  currentSender = sender ?? resendSender;
}

export function getAuthEmailSender(): AuthEmailSender {
  return currentSender;
}

export async function sendOwnerVerificationEmail(input: OwnerVerificationEmailInput): Promise<void> {
  await currentSender.sendOwnerVerificationEmail(input);
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
  await currentSender.sendPasswordResetEmail(input);
}
