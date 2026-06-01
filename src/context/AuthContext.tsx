import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../lib/api';

export type UserRole = 'owner' | 'manager' | 'cashier' | 'print_operator' | 'inventory_officer';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  activeOverrides: string[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (u: Partial<User>, newToken?: string) => void;
  refreshOverrides: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('ps_token'));
  const [loading, setLoading] = useState(true);
  const [activeOverrides, setActiveOverrides] = useState<string[]>([]);

  const fetchOverrides = async () => {
    try {
      const data = await authApi.myOverrides();
      setActiveOverrides(data.modules ?? []);
    } catch {
      setActiveOverrides([]);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('ps_token');
    if (storedToken) {
      authApi.me()
        .then(data => {
          setUser(data.user);
          return fetchOverrides();
        })
        .catch(() => {
          localStorage.removeItem('ps_token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const interval = setInterval(fetchOverrides, 5 * 60 * 1000);

    const onFocus = () => { fetchOverrides(); };
    window.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.id]);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    localStorage.setItem('ps_token', data.token);
    setToken(data.token);
    setUser(data.user);
    await fetchOverrides();
  };

  const logout = () => {
    localStorage.removeItem('ps_token');
    setToken(null);
    setUser(null);
    setActiveOverrides([]);
  };

  const updateUser = (u: Partial<User>, newToken?: string) => {
    setUser(prev => prev ? { ...prev, ...u } : prev);
    if (newToken) {
      localStorage.setItem('ps_token', newToken);
      setToken(newToken);
    }
  };

  const refreshOverrides = fetchOverrides;

  return (
    <AuthContext.Provider value={{ user, token, loading, activeOverrides, login, logout, updateUser, refreshOverrides, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
