import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  applyBrandCssVars,
  brandingFromUser,
  deriveBrandCssVars,
  shouldApplyChurchBranding,
  type ChurchBrandingDraft,
} from '../utils/branding';
import { applyChurchFavicon } from '../utils/favicon';
import { useTheme } from './ThemeContext';

interface BrandingContextValue {
  branding: ChurchBrandingDraft | null;
  preview: ChurchBrandingDraft | null;
  setPreview: (next: ChurchBrandingDraft | null) => void;
  setPublicBranding: (next: ChurchBrandingDraft | null) => void;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const { pathname } = useLocation();
  const [preview, setPreview] = useState<ChurchBrandingDraft | null>(null);
  const [publicBranding, setPublicBranding] = useState<ChurchBrandingDraft | null>(null);

  const resolved = useMemo(() => {
    if (!shouldApplyChurchBranding(pathname)) return null;
    return preview || publicBranding || brandingFromUser(user);
  }, [pathname, preview, publicBranding, user]);

  useLayoutEffect(() => {
    applyBrandCssVars(deriveBrandCssVars(resolved, theme));
    applyChurchFavicon(resolved?.logoUrl);
  }, [resolved, theme]);

  useLayoutEffect(() => {
    return () => {
      applyBrandCssVars(null);
      applyChurchFavicon(undefined);
    };
  }, []);

  const setPreviewSafe = useCallback((next: ChurchBrandingDraft | null) => {
    setPreview(next);
  }, []);

  const value = useMemo(
    () => ({
      branding: resolved,
      preview,
      setPreview: setPreviewSafe,
      setPublicBranding,
    }),
    [preview, resolved, setPreviewSafe]
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error('useBranding deve ser usado dentro de BrandingProvider');
  }
  return context;
}
