const STORAGE_KEY = 'cv-email-challenge';

export function savePendingChallengeId(challengeId: string): void {
  sessionStorage.setItem(STORAGE_KEY, challengeId);
}

export function readPendingChallengeId(): string | null {
  const value = sessionStorage.getItem(STORAGE_KEY)?.trim();
  return value || null;
}

export function clearPendingChallengeId(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const domainParts = domain.split('.');
  const name = domainParts[0] || '*';
  const rest = domainParts.slice(1).join('.');
  return `${local[0]}***@${name[0] || '*'}***${rest ? `.${rest}` : ''}`;
}

export function resendSecondsLeft(availableAt: string | undefined, now = Date.now()): number {
  if (!availableAt) return 0;
  const remaining = Math.ceil((new Date(availableAt).getTime() - now) / 1000);
  return remaining > 0 ? remaining : 0;
}
