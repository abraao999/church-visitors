import { Resend } from 'resend';
import {
  buildEmailActionLink,
  getEmailFrom,
  getEmailReplyTo,
  getPasswordResetTtlMs,
  getPublicAppOrigin,
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

export type OwnerWelcomeEmailInput = {
  to: string;
  name: string;
  churchName: string;
  idempotencyKey: string;
};

export type AuthEmailSender = {
  sendOwnerVerificationEmail(input: OwnerVerificationEmailInput): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void>;
  sendOwnerWelcomeEmail(input: OwnerWelcomeEmailInput): Promise<void>;
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

function subjectLabel(value: string, max = 42): string {
  const text = safeText(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function emailAddressFromFromHeader(from: string): string {
  const angled = from.match(/<([^>]+)>/);
  return (angled?.[1] || from).trim();
}

function renderEmailDocument(input: {
  heading: string;
  innerHtml: string;
  footer: string;
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;padding:28px 24px;">
          <tr>
            <td>
              <p style="margin:0 0 16px;font-size:14px;color:#78716c;">Eclesiafy</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(input.heading)}</h1>
              ${input.innerHtml}
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#78716c;">${escapeHtml(input.footer)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function actionButton(url: string, label: string): string {
  return `<p style="margin:0 0 16px;">
                <a href="${escapeHtml(url)}" style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">${escapeHtml(label)}</a>
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.5;word-break:break-all;">Se o botão não abrir, use este endereço:<br>${escapeHtml(url)}</p>`;
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
  const subject = `Seu código Eclesiafy: ${code}`;
  const text = [
    `Olá, ${name}.`,
    `Alguém usou este e-mail para cadastrar ${churchName} na Eclesiafy.`,
    `Para concluir, abra este link: ${input.confirmUrl}`,
    `Ou digite o código ${code} na tela de confirmação.`,
    `O link e o código valem por ${input.ttlMinutes} minutos.`,
    'Se você não fez este cadastro, ignore esta mensagem. Nenhuma igreja será criada.',
    'Eclesiafy · app.eclesiafy.com.br',
  ].join('\n\n');

  const html = renderEmailDocument({
    heading: 'Confirme o e-mail do cadastro',
    footer:
      'Você recebeu esta mensagem porque este endereço foi informado no cadastro de uma igreja na Eclesiafy. Se não foi você, ignore o e-mail.',
    innerHtml: `
              <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Olá, ${escapeHtml(name)}.</p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Alguém usou este e-mail para cadastrar <strong>${escapeHtml(churchName)}</strong> na Eclesiafy. Confirme que o endereço é seu para concluir.</p>
              ${actionButton(input.confirmUrl, 'Confirmar meu e-mail')}
              <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Se preferir, use este código de seis dígitos na tela de confirmação:</p>
              <p style="margin:0 0 16px;font-size:26px;letter-spacing:.2em;font-weight:700;">${escapeHtml(code)}</p>
              <p style="margin:0;font-size:14px;color:#57534e;">O link e o código valem por ${escapeHtml(input.ttlMinutes)} minutos.</p>`,
  });

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
    `Recebemos um pedido para redefinir a senha da conta de ${churchName} na Eclesiafy.`,
    `Crie uma nova senha neste link: ${input.resetUrl}`,
    `Este link vale por ${input.ttlMinutes} minutos.`,
    'Se você não pediu esta alteração, ignore esta mensagem. A senha atual continua valendo.',
    'Eclesiafy · app.eclesiafy.com.br',
  ].join('\n\n');

  const html = renderEmailDocument({
    heading: 'Redefinição de senha',
    footer:
      'Você recebeu esta mensagem porque alguém pediu a redefinição de senha desta conta na Eclesiafy. Se não foi você, ignore o e-mail.',
    innerHtml: `
              <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Olá, ${escapeHtml(name)}.</p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Recebemos um pedido para redefinir a senha da conta de <strong>${escapeHtml(churchName)}</strong>.</p>
              ${actionButton(input.resetUrl, 'Criar uma nova senha')}
              <p style="margin:0;font-size:14px;color:#57534e;">Este link vale por ${escapeHtml(input.ttlMinutes)} minutos.</p>`,
  });

  return { subject, html, text };
}

export function renderOwnerWelcomeEmail(input: {
  name: string;
  churchName: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const name = safeText(input.name);
  const churchName = safeText(input.churchName);
  const subject = `Cadastro da ${subjectLabel(churchName)} concluído`;
  const text = [
    `Olá, ${name}.`,
    `O cadastro da ${churchName} na Eclesiafy foi concluído com sucesso.`,
    'O e-mail já está confirmado e a conta do proprietário está pronta para uso.',
    `Acesse o sistema neste endereço: ${input.appUrl}`,
    'Se você não reconhece esta conta, responda este e-mail.',
    'Eclesiafy · app.eclesiafy.com.br',
  ].join('\n\n');

  const html = renderEmailDocument({
    heading: 'Cadastro concluído',
    footer:
      'Você recebeu esta mensagem porque o e-mail informado no cadastro desta igreja foi confirmado na Eclesiafy.',
    innerHtml: `
              <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Olá, ${escapeHtml(name)}.</p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">O cadastro da <strong>${escapeHtml(churchName)}</strong> foi concluído com sucesso. O e-mail já está confirmado e a conta do proprietário está pronta.</p>
              ${actionButton(input.appUrl, 'Abrir a Eclesiafy')}`,
  });

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
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
          'List-Unsubscribe': `<mailto:${emailAddressFromFromHeader(getEmailFrom())}>`,
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

  async sendOwnerWelcomeEmail(input) {
    const rendered = renderOwnerWelcomeEmail({
      name: input.name,
      churchName: input.churchName,
      appUrl: getPublicAppOrigin(),
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

export async function sendOwnerWelcomeEmail(input: OwnerWelcomeEmailInput): Promise<void> {
  await currentSender.sendOwnerWelcomeEmail(input);
}
