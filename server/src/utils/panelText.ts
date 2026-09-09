export const PANEL_OBSERVATION_MAX = 80;
export const PRAYER_PANEL_TEXT_MAX = 120;
export const PANEL_NAME_MAX = 80;
export const PANEL_CITY_MAX = 80;

/**
 * Texto seguro para projeção: sem HTML, sem caracteres de controle e com
 * tamanho limitado para caber na TV sem cortar com reticências no CSS.
 */
export function sanitizePanelText(value: string, max: number): string {
  return value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;|&gt;|&amp;|&quot;|&#39;/gi, ' ')
    // eslint-disable-next-line no-control-regex -- sanitização intencional
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function normalizePanelObservation(value: unknown): string {
  if (typeof value !== 'string') return '';
  return sanitizePanelText(value, PANEL_OBSERVATION_MAX);
}

export function readShowObservationOnPanel(value: unknown): boolean {
  return value === true;
}

export function firstPublicName(name: string): string {
  return sanitizePanelText(name, PANEL_NAME_MAX).split(/\s+/)[0] ?? '';
}
