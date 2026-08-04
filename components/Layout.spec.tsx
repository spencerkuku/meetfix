import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { AuthProvider } from '../state/auth';
import { ToastProvider } from './Toast';
import { User, UserRole } from '../types';

vi.mock('../services/auth', () => ({
  getToken: vi.fn(() => 'token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  googleLoginUrl: vi.fn(),
  exchangeLoginCode: vi.fn(),
  fetchCurrentUser: vi.fn(),
  registerWithPassword: vi.fn(),
  loginWithPassword: vi.fn(),
  updateProfile: vi.fn(),
  getGoogleLinkUrl: vi.fn(),
  changePassword: vi.fn(),
}));

import * as authService from '../services/auth';

// jsdom in this project's test environment doesn't provide window.localStorage
// (only needed here so far, since Layout reads/writes the sidebar-collapsed
// flag) — stub it with an in-memory Map-backed implementation.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, value); }
}
Object.defineProperty(window, 'localStorage', { value: new MemoryStorage() });

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: '測試使用者',
    email: 'test@school.edu',
    role: UserRole.USER,
    avatarUrl: null,
    ...overrides,
  };
}

function renderLayout() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>
          <Layout>
            <div>content</div>
          </Layout>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function openAccountSettings() {
  const trigger = await screen.findByTitle('點擊開啟帳號設定');
  fireEvent.click(trigger);
  await screen.findByText('帳號設定');
}

describe('Layout — Account Settings 報修人資料', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the current class/phone when opening Account Settings', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(
      makeUser({ class: '資訊三甲', phone: '0912-345-678' }),
    );
    renderLayout();

    await openAccountSettings();

    expect(screen.getByPlaceholderText('例: 資訊三甲')).toHaveValue('資訊三甲');
    expect(screen.getByPlaceholderText('09xx-xxx-xxx')).toHaveValue('0912-345-678');
  });

  it('disables the save button while either field is blank', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser());
    renderLayout();

    await openAccountSettings();

    expect(screen.getByText('儲存報修人資料')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('例: 資訊三甲'), {
      target: { value: '資訊三甲' },
    });
    expect(screen.getByText('儲存報修人資料')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('09xx-xxx-xxx'), {
      target: { value: '0912-345-678' },
    });
    expect(screen.getByText('儲存報修人資料')).not.toBeDisabled();
  });

  it('saves class/phone via updateProfile when the save button is clicked', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser());
    vi.mocked(authService.updateProfile).mockResolvedValue({
      class: '資訊三甲',
      phone: '0912-345-678',
    });
    renderLayout();

    await openAccountSettings();
    fireEvent.change(screen.getByPlaceholderText('例: 資訊三甲'), {
      target: { value: '資訊三甲' },
    });
    fireEvent.change(screen.getByPlaceholderText('09xx-xxx-xxx'), {
      target: { value: '0912-345-678' },
    });
    fireEvent.click(screen.getByText('儲存報修人資料'));

    await waitFor(() =>
      expect(authService.updateProfile).toHaveBeenCalledWith(
        'token',
        '資訊三甲',
        '0912-345-678',
      ),
    );
    await screen.findByText('個人資料已更新');
  });
});
