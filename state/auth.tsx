import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types';
import {
  getToken,
  setToken,
  clearToken,
  fetchCurrentUser,
  googleLoginUrl,
  exchangeLoginCode,
  registerWithPassword as registerWithPasswordApi,
  loginWithPassword as loginWithPasswordApi,
  updateProfile as updateProfileApi,
} from '../services/auth';

export interface AuthData {
  currentUser: User | null;
  authLoading: boolean;
  loginWithGoogle: () => void;
  completeGoogleLogin: (code: string) => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  registerWithPassword: (email: string, name: string, password: string) => Promise<'ACTIVE' | 'PENDING'>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  updateProfile: (userClass: string, phone: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthData | undefined>(undefined);

export const useAuthData = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthData must be used within an AuthProvider');
  return context;
};

// Owns the current User and every login/logout flow. Every other domain
// Provider (Rooms/Bookings/Repairs/Admin) reads `currentUser` from here to
// gate its own fetch — this is the only Provider that doesn't itself
// depend on another domain's data.
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthLoading(false);
      return;
    }
    fetchCurrentUser(token).then(user => {
      if (!user) clearToken();
      setCurrentUser(user);
      setAuthLoading(false);
    });
  }, []);

  const loginWithGoogle = () => {
    window.location.href = googleLoginUrl();
  };

  const completeGoogleLogin = async (code: string) => {
    const token = await exchangeLoginCode(code);
    if (!token) return;
    setToken(token);
    const user = await fetchCurrentUser(token);
    setCurrentUser(user);
  };

  // Re-fetches /auth/me against the existing session — used after linking a
  // Google account, so the sidebar/profile reflect the new googleLinked
  // status without requiring a fresh login.
  const refreshCurrentUser = async () => {
    const token = getToken();
    if (!token) return;
    const user = await fetchCurrentUser(token);
    setCurrentUser(user);
  };

  const registerWithPassword = (email: string, name: string, password: string) => {
    return registerWithPasswordApi(email, name, password);
  };

  const loginWithPassword = async (email: string, password: string) => {
    const token = await loginWithPasswordApi(email, password);
    setToken(token);
    const user = await fetchCurrentUser(token);
    setCurrentUser(user);
  };

  // Saves 班級/部門 + 電話 to the current User's profile — shared by the
  // Account Settings save action and (via a subsequent refreshCurrentUser)
  // by Repair Ticket submission's write-back. Updates state directly from
  // the response rather than re-fetching, since the response already
  // carries the saved values.
  const updateProfile = async (userClass: string, phone: string) => {
    const token = getToken();
    if (!token) return;
    const updated = await updateProfileApi(token, userClass, phone);
    setCurrentUser((prev) => (prev ? { ...prev, class: updated.class, phone: updated.phone } : prev));
  };

  const logout = () => {
    clearToken();
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{
      currentUser, authLoading,
      loginWithGoogle, completeGoogleLogin, refreshCurrentUser, registerWithPassword, loginWithPassword, updateProfile, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
