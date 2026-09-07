/**
 * O endereço do Holyrics no modo local é digitado pelo responsável e vira uma
 * URL que o servidor chama. Sem validação isso permite apontar o servidor para
 * endereços internos da hospedagem (SSRF). O modo local é legítimo em rede
 * privada, então o bloqueio se limita aos endereços de metadados de nuvem, que
 * respondem sem autenticação e entregam credenciais da infraestrutura.
 */

const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

const METADATA_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const METADATA_ADDRESSES = new Set([
  '169.254.169.254', // AWS, GCP, Azure, DigitalOcean
  '169.254.170.2', // credenciais de task no ECS
  '100.100.100.200', // Alibaba Cloud
]);

export class HolyricsHostError extends Error {}

function isMetadataAddress(host: string): boolean {
  if (METADATA_HOSTNAMES.has(host) || METADATA_ADDRESSES.has(host)) return true;
  // Faixa link-local 169.254.0.0/16, usada pelos serviços de metadados.
  return host.startsWith('169.254.');
}

/**
 * Aceita apenas IP ou nome de máquina. Rejeitar qualquer outro caractere
 * elimina de uma vez esquema (`http://`), credenciais (`@`), caminho (`/`),
 * consulta (`?`) e porta embutida (`:`).
 */
export function normalizeHolyricsHost(raw: unknown): string {
  const host = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!host) {
    throw new HolyricsHostError('Informe o IP ou o nome do computador do Holyrics');
  }

  if (/[^a-z0-9.-]/.test(host)) {
    throw new HolyricsHostError(
      'Informe apenas o IP ou o nome do computador, sem http:// e sem barras'
    );
  }

  if (host.length > 253 || !HOSTNAME_PATTERN.test(host)) {
    throw new HolyricsHostError('Endereço do Holyrics inválido');
  }

  if (isMetadataAddress(host)) {
    throw new HolyricsHostError('Este endereço é reservado pela hospedagem e não pode ser usado');
  }

  return host;
}
