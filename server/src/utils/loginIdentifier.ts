/** Aceita `login` (usuário ou e-mail) e o campo antigo `email`. */
export function readLoginIdentifier(body?: Record<string, unknown>): string {
  const raw =
    (typeof body?.login === 'string' && body.login) ||
    (typeof body?.email === 'string' && body.email) ||
    '';
  return raw.trim().toLowerCase();
}
