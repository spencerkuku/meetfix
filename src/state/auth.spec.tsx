import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuthData } from './auth';
import { User, UserRole } from '../types';

vi.mock('../services/auth', () => ({
  getToken: vi.fn(),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  googleLoginUrl: vi.fn(() => 'https://accounts.google.com/mock'),
  exchangeLoginCode: vi.fn(),
  fetchCurrentUser: vi.fn(),
  getAuthProviders: vi.fn(),
  registerWithPassword: vi.fn(),
  loginWithPassword: vi.fn(),
  updateProfile: vi.fn(),
}));

import * as authService from '../services/auth';

const user: User = {
  id: 'u1',
  name: 'Test User',
  email: 'test@school.edu',
  role: UserRole.USER,
  avatarUrl: null,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthProvider / useAuthData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finishes authLoading with no currentUser when no token is stored', async () => {
    vi.mocked(authService.getToken).mockReturnValue(null);
    const { result } = renderHook(() => useAuthData(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.currentUser).toBeNull();
    expect(authService.fetchCurrentUser).not.toHaveBeenCalled();
  });

  it('fetches the current User when a token is already stored', async () => {
    vi.mocked(authService.getToken).mockReturnValue('existing-token');
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(user);
    const { result } = renderHook(() => useAuthData(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.currentUser).toEqual(user);
  });

  it('loginWithPassword stores the token and sets currentUser', async () => {
    vi.mocked(authService.getToken).mockReturnValue(null);
    vi.mocked(authService.loginWithPassword).mockResolvedValue('new-token');
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(user);
    const { result } = renderHook(() => useAuthData(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    await act(async () => {
      await result.current.loginWithPassword('test@school.edu', 'password');
    });

    expect(authService.setToken).toHaveBeenCalledWith('new-token');
    expect(result.current.currentUser).toEqual(user);
  });

  it('logout clears the token and currentUser', async () => {
    vi.mocked(authService.getToken).mockReturnValue('existing-token');
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(user);
    const { result } = renderHook(() => useAuthData(), { wrapper });
    await waitFor(() => expect(result.current.currentUser).toEqual(user));

    act(() => {
      result.current.logout();
    });

    expect(authService.clearToken).toHaveBeenCalled();
    expect(result.current.currentUser).toBeNull();
  });

  it('fetches class/phone through fetchCurrentUser once saved', async () => {
    vi.mocked(authService.getToken).mockReturnValue('existing-token');
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue({
      ...user,
      class: '資訊三甲',
      phone: '0912-345-678',
    });
    const { result } = renderHook(() => useAuthData(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.currentUser?.class).toBe('資訊三甲');
    expect(result.current.currentUser?.phone).toBe('0912-345-678');
  });

  it('updateProfile saves class/phone and updates currentUser from the response', async () => {
    vi.mocked(authService.getToken).mockReturnValue('existing-token');
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(user);
    vi.mocked(authService.updateProfile).mockResolvedValue({
      class: '資訊三甲',
      phone: '0912-345-678',
    });
    const { result } = renderHook(() => useAuthData(), { wrapper });
    await waitFor(() => expect(result.current.currentUser).toEqual(user));

    await act(async () => {
      await result.current.updateProfile('資訊三甲', '0912-345-678');
    });

    expect(authService.updateProfile).toHaveBeenCalledWith(
      'existing-token',
      '資訊三甲',
      '0912-345-678',
    );
    expect(result.current.currentUser?.class).toBe('資訊三甲');
    expect(result.current.currentUser?.phone).toBe('0912-345-678');
  });

  it('updateProfile does nothing when there is no stored token', async () => {
    vi.mocked(authService.getToken).mockReturnValue(null);
    const { result } = renderHook(() => useAuthData(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    await act(async () => {
      await result.current.updateProfile('資訊三甲', '0912-345-678');
    });

    expect(authService.updateProfile).not.toHaveBeenCalled();
  });
});
