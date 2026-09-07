export function validCronAuthorization(
  authorization: string | undefined,
  secret: string | undefined
): boolean {
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}
