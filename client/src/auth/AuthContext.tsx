import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearLegacyToken } from '../api/client';
import type {
  AuthUser,
  EmailConfirmationRequest,
  PendingRegistrationResponse,
} from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (data: {
    churchName: string;
    name: string;
    email: string;
    username: string;
    password: string;
  }) => Promise<PendingRegistrationResponse>;
  confirmEmail: (data: EmailConfirmationRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setChurchName: (churchName: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearLegacyToken();
    api
      .me()
      .then(setUser)
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (loginValue: string, password: string) => {
    const result = await api.login({ login: loginValue, password });
    setUser(result.user);
  }, []);

  const register = useCallback(
    async (data: {
      churchName: string;
      name: string;
      email: string;
      username: string;
      password: string;
    }) => {
      return api.register(data);
    },
    []
  );

  const confirmEmail = useCallback(async (data: EmailConfirmationRequest) => {
    const result = await api.confirmEmail(data);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Mesmo offline, a tela volta ao login.
    } finally {
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const next = await api.me();
    setUser(next);
  }, []);

  const setChurchName = useCallback((churchName: string) => {
    setUser((prev) => (prev ? { ...prev, churchName } : prev));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, confirmEmail, logout, refreshUser, setChurchName }),
    [user, loading, login, register, confirmEmail, logout, refreshUser, setChurchName]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
