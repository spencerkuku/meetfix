import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Repairs } from './Repairs';
import { AuthProvider } from '../state/auth';
import { RepairsProvider } from '../state/repairs';
import { ToastProvider } from '../components/Toast';
import { User, UserRole, RepairCategory } from '../types';

vi.mock('../services/auth', () => ({
  getToken: vi.fn(() => 'token'),
  setToken: vi.fn(),
  clearToken: vi.fn(),
  googleLoginUrl: vi.fn(),
  exchangeLoginCode: vi.fn(),
  fetchCurrentUser: vi.fn(),
  getAuthProviders: vi.fn(),
  registerWithPassword: vi.fn(),
  loginWithPassword: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../services/repairs', () => ({
  fetchRepairs: vi.fn().mockResolvedValue([]),
  fetchRepairCategories: vi.fn(),
  createRepairTicket: vi.fn(),
  updateRepairTicket: vi.fn(),
  updateRepairContent: vi.fn(),
  deleteRepairTicket: vi.fn(),
  createRepairCategory: vi.fn(),
  deleteRepairCategory: vi.fn(),
}));

import * as authService from '../services/auth';
import * as repairsService from '../services/repairs';

const category: RepairCategory = { id: 'c1', name: '硬體設備' };

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

function renderRepairsPage() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <RepairsProvider>
          <Repairs />
        </RepairsProvider>
      </AuthProvider>
    </ToastProvider>,
  );
}

async function openCreateModal() {
  fireEvent.click(await screen.findByText('我要報修'));
  await screen.findByText('通報設施問題');
}

function fillLocationCategoryDescription() {
  fireEvent.change(screen.getByPlaceholderText('例如：2樓走廊, 一樓大廳...'), {
    target: { value: 'A101' },
  });
  fireEvent.change(screen.getByPlaceholderText('請詳細描述遇到的問題狀況、發生頻率...'), {
    target: { value: '投影機故障' },
  });
}

describe('Repairs page — reporter info pre-fill and required validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repairsService.fetchRepairCategories).mockResolvedValue([category]);
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([]);
  });

  it('pre-fills 班級/部門 and 電話 from the current User profile when opening the create form', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(
      makeUser({ class: '資訊三甲', phone: '0912-345-678' }),
    );
    renderRepairsPage();

    await openCreateModal();

    expect(screen.getByPlaceholderText('例: 資訊三甲')).toHaveValue('資訊三甲');
    expect(screen.getByPlaceholderText('09xx-xxx-xxx')).toHaveValue('0912-345-678');
  });

  it('leaves 班級/部門 and 電話 blank when the User has no saved profile info yet', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser());
    renderRepairsPage();

    await openCreateModal();

    expect(screen.getByPlaceholderText('例: 資訊三甲')).toHaveValue('');
    expect(screen.getByPlaceholderText('09xx-xxx-xxx')).toHaveValue('');
  });

  it('blocks submission and shows an error when 班級/部門 or 電話 is blank, without calling createRepairTicket', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser());
    renderRepairsPage();

    await openCreateModal();
    fillLocationCategoryDescription();
    // fireEvent.submit bypasses the browser's own HTML5 `required`
    // constraint validation (which a real click-triggered submit would
    // also enforce) so this exercises handleSubmit's own required check.
    fireEvent.submit(screen.getByText('送出通報').closest('form')!);

    await screen.findByText('請填寫班級/部門與聯絡電話');
    expect(repairsService.createRepairTicket).not.toHaveBeenCalled();
  });

  it('submits successfully once 班級/部門 and 電話 are filled, and refreshes currentUser afterwards', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser());
    vi.mocked(repairsService.createRepairTicket).mockResolvedValue({
      id: 't1',
      location: 'A101',
      category: '硬體設備',
      description: '投影機故障',
      status: 'PENDING',
      userName: '測試使用者',
      userId: 'u1',
      userPhone: '0912-345-678',
      userClass: '資訊三甲',
      createdAt: new Date().toISOString(),
    } as never);
    renderRepairsPage();

    await openCreateModal();
    fillLocationCategoryDescription();
    fireEvent.change(screen.getByPlaceholderText('例: 資訊三甲'), {
      target: { value: '資訊三甲' },
    });
    fireEvent.change(screen.getByPlaceholderText('09xx-xxx-xxx'), {
      target: { value: '0912-345-678' },
    });
    fireEvent.click(screen.getByText('送出通報'));

    await waitFor(() => expect(repairsService.createRepairTicket).toHaveBeenCalledTimes(1));
    expect(repairsService.createRepairTicket).toHaveBeenCalledWith(
      expect.objectContaining({ userClass: '資訊三甲', userPhone: '0912-345-678' }),
      undefined,
    );
    // Submission's write-back happens server-side; the frontend re-fetches
    // currentUser afterwards so the next ticket's pre-fill reflects it.
    await waitFor(() => expect(authService.fetchCurrentUser).toHaveBeenCalledTimes(2));
  });
});
