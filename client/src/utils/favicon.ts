const CHURCH_FAVICON = 'data-church-favicon';

export function applyChurchFavicon(logoUrl?: string): void {
  const existing = document.querySelector<HTMLLinkElement>(`link[${CHURCH_FAVICON}]`);
  if (!logoUrl) {
    existing?.remove();
    return;
  }
  const link = existing || document.createElement('link');
  link.rel = 'icon';
  link.setAttribute(CHURCH_FAVICON, 'true');
  link.href = logoUrl;
  if (!existing) document.head.appendChild(link);
}

export function restoreDefaultFavicon(): void {
  applyChurchFavicon(undefined);
}
