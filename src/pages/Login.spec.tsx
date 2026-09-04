import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Login } from './Login';
import { AuthProvider } from '../state/auth';
import { ToastProvider } from '../components/Toast';

vi.mock('../services/auth', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  googleLoginUrl: vi.fn(() => 'https://accounts.google.com/mock'),
  exchangeLoginCode: vi.fn(),
  fetchCurrentUser: vi.fn(),
  registerWithPassword: vi.fn(),
  loginWithPassword: vi.fn(),
  updateProfile: vi.fn(),
  getAuthProviders: vi.fn(),
}));

import * as authService from '../services/auth';

function renderLogin() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('Login — Google 登入按鈕依 googleEnabled 顯示／隱藏', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.getToken).mockReturnValue(null);
  });

  it('shows the Google login button and caption when googleEnabled is true', async () => {
    vi.mocked(authService.getAuthProviders).mockResolvedValue({ googleEnabled: true });
    renderLogin();

    await screen.findByText('使用學校 Google 帳號登入');
    expect(
      screen.getByText('僅限學校 Google Workspace 帳號可登入'),
    ).toBeInTheDocument();
  });

  it('hides the Google login button and caption when googleEnabled is false', async () => {
    vi.mocked(authService.getAuthProviders).mockResolvedValue({ googleEnabled: false });
    renderLogin();

    await waitFor(() => expect(authService.getAuthProviders).toHaveBeenCalled());
    expect(screen.queryByText('使用學校 Google 帳號登入')).not.toBeInTheDocument();
    expect(
      screen.queryByText('僅限學校 Google Workspace 帳號可登入'),
    ).not.toBeInTheDocument();
  });

  it('always shows the password login form regardless of googleEnabled', async () => {
    vi.mocked(authService.getAuthProviders).mockResolvedValue({ googleEnabled: false });
    renderLogin();

    await waitFor(() => expect(authService.getAuthProviders).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('密碼')).toBeInTheDocument();
  });
});
