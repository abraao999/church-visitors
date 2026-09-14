export function projectionPrivacyHint(anonymous: boolean, allowProjection: boolean): string {
  if (allowProjection !== true) {
    return 'Seu pedido ficará visível somente para os responsáveis.';
  }
  if (anonymous === true) {
    return 'Será exibido como “Anônimo” durante o culto.';
  }
  return 'Será exibido com seu primeiro nome durante o culto.';
}
