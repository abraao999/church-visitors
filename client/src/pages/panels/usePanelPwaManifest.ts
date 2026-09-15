import { useEffect } from 'react';
import { registerPortariaServiceWorker } from '../../pwa/registerPortariaSw';

const DEFAULT_TITLE = 'Church Visitors';
const PANEL_TITLE = 'Painel do culto';
const DEFAULT_MANIFEST = '/site.webmanifest';
const PANEL_MANIFEST = '/panel.webmanifest';

function setMetaContent(name: string, content: string) {
  document.querySelector(`meta[name="${name}"]`)?.setAttribute('content', content);
}

export function usePanelPwaManifest() {
  useEffect(() => {
    const manifest = document.querySelector('link[rel="manifest"]');
    const previousManifest = manifest?.getAttribute('href') || DEFAULT_MANIFEST;
    const previousTitle = document.title || DEFAULT_TITLE;
    const previousAppleTitle =
      document.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content') || DEFAULT_TITLE;
    const previousApplicationName =
      document.querySelector('meta[name="application-name"]')?.getAttribute('content') || DEFAULT_TITLE;
    const previousThemeColor =
      document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '#ffffff';

    document.title = PANEL_TITLE;
    manifest?.setAttribute('href', PANEL_MANIFEST);
    setMetaContent('apple-mobile-web-app-title', PANEL_TITLE);
    setMetaContent('application-name', PANEL_TITLE);
    setMetaContent('theme-color', '#f8f6f2');
    void registerPortariaServiceWorker(() => undefined);

    return () => {
      document.title = previousTitle;
      manifest?.setAttribute('href', previousManifest);
      setMetaContent('apple-mobile-web-app-title', previousAppleTitle);
      setMetaContent('application-name', previousApplicationName);
      setMetaContent('theme-color', previousThemeColor);
    };
  }, []);
}
