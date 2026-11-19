import { createContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from '../lib/api-client';
import type { User, LoginResponse, MfaRequiredResponse } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, portal?: 'customer' | 'staff') => Promise<LoginResponse | MfaRequiredResponse>;
  verifyMfa: (mfaToken: string, code: string) => Promise<LoginResponse>;
  completeMfaSetup: (
    mfaToken: string,
    code: string,
    securityAnswers: [string, string, string]
  ) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user on mount if token exists
  useEffect(() => {
    const loadUser = async () => {
      if (apiClient.isAuthenticated()) {
        try {
          const response = await apiClient.get<{ data: User }>('/me');
          setUser(response.data);
          
          // Set role attribute on body for CSS
          document.body.dataset.role = response.data.role_name;
        } catch (error) {
          console.error('Failed to load user:', error);
          apiClient.clearTokens();
        }
      }
      setLoading(false);
    };

    loadUser();
  }, []);

  const login = async (
    username: string,
    password: string,
    portal: 'customer' | 'staff' = 'customer'
  ): Promise<LoginResponse | MfaRequiredResponse> => {
    const response = await apiClient.post<{ data: LoginResponse | MfaRequiredResponse }>(
      '/auth/login',
      { username, password, portal },
      { skipAuth: true }
    );

    const data = response.data;

    // Check if MFA required
    if ('mfa_required' in data && data.mfa_required) {
      return data as MfaRequiredResponse;
    }

    // Normal login
    const loginData = data as LoginResponse;
    apiClient.setTokens(loginData.tokens.access_token, loginData.tokens.refresh_token);
    setUser(loginData.user);
    document.body.dataset.role = loginData.user.role_name;

    return loginData;
  };

  const verifyMfa = async (mfaToken: string, code: string): Promise<LoginResponse> => {
    const response = await apiClient.post<{ data: LoginResponse }>(
      '/auth/mfa/verify',
      { mfa_token: mfaToken, code },
      { skipAuth: true }
    );

    const loginData = response.data;
    apiClient.setTokens(loginData.tokens.access_token, loginData.tokens.refresh_token);
    setUser(loginData.user);
    document.body.dataset.role = loginData.user.role_name;

    return loginData;
  };

  const completeMfaSetup = async (
    mfaToken: string,
    code: string,
    securityAnswers: [string, string, string]
  ): Promise<LoginResponse> => {
    const response = await apiClient.post<{ data: LoginResponse }>(
      '/auth/mfa/confirm',
      { mfa_token: mfaToken, code, security_answers: securityAnswers },
      { skipAuth: true }
    );

    const loginData = response.data;
    apiClient.setTokens(loginData.tokens.access_token, loginData.tokens.refresh_token);
    setUser(loginData.user);
    document.body.dataset.role = loginData.user.role_name;

    return loginData;
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      apiClient.clearTokens();
      setUser(null);
      delete document.body.dataset.role;
    }
  };

  const refreshUser = async () => {
    if (apiClient.isAuthenticated()) {
      const response = await apiClient.get<{ data: User }>('/me');
      setUser(response.data);
      document.body.dataset.role = response.data.role_name;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyMfa, completeMfaSetup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export { useAuth } from '../hooks/useAuth';
