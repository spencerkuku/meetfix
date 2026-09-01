import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { RepairManagement } from './RepairManagement';
import { AuthProvider } from '../state/auth';
import { RepairsProvider } from '../state/repairs';
import { ToastProvider } from '../components/Toast';
import { User, UserRole, RepairTicket, RepairStatus } from '../types';

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
}));

vi.mock('../services/repairs', () => ({
  fetchRepairs: vi.fn().mockResolvedValue([]),
  fetchRepairCategories: vi.fn().mockResolvedValue([]),
  createRepairTicket: vi.fn(),
  updateRepairTicket: vi.fn(),
  updateRepairContent: vi.fn(),
  deleteRepairTicket: vi.fn(),
  createRepairCategory: vi.fn(),
  deleteRepairCategory: vi.fn(),
  exportRepairsCsv: vi.fn(),
}));

import * as authService from '../services/auth';
import * as repairsService from '../services/repairs';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'admin1',
    name: '管理員',
    email: 'admin@school.edu',
    role: UserRole.ADMIN,
    avatarUrl: null,
    ...overrides,
  };
}

function makeTicket(overrides: Partial<RepairTicket> = {}): RepairTicket {
  return {
    id: 't1',
    location: 'A101',
    userId: 'u1',
    userName: '報修人',
    description: '投影機故障',
    category: '硬體設備',
    status: RepairStatus.PENDING,
    createdAt: new Date().toISOString(),
    resolvedByName: null,
    ...overrides,
  };
}

function renderRepairManagement() {
  return render(
    <ToastProvider>
      <AuthProvider>
        <RepairsProvider>
          <RepairManagement />
        </RepairsProvider>
      </AuthProvider>
    </ToastProvider>,
  );
}

describe('RepairManagement — reply affordance in the ticket list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser());
  });

  it('shows an unanswered-style reply button for a ticket with no adminReply yet', async () => {
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([makeTicket({ adminReply: undefined })]);
    renderRepairManagement();

    const table = await screen.findByRole('table');
    const replyButton = within(table).getByRole('button', { name: '回覆' });
    expect(replyButton).toHaveAttribute('data-replied', 'false');
  });

  it('shows an answered-style reply button for a ticket that already has an adminReply', async () => {
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([
      makeTicket({ adminReply: '已更換投影機燈泡' }),
    ]);
    renderRepairManagement();

    const table = await screen.findByRole('table');
    const replyButton = within(table).getByRole('button', { name: '回覆' });
    expect(replyButton).toHaveAttribute('data-replied', 'true');
  });

  it('opens the detail modal when the reply button is clicked', async () => {
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([makeTicket()]);
    renderRepairManagement();

    const table = await screen.findByRole('table');
    within(table).getByRole('button', { name: '回覆' }).click();

    await screen.findByText('維修回覆與備註');
  });

  it('renders a reply button for tickets in every status', async () => {
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([
      makeTicket({ id: 't1', status: RepairStatus.PENDING }),
      makeTicket({ id: 't2', status: RepairStatus.IN_PROGRESS }),
      makeTicket({ id: 't3', status: RepairStatus.COMPLETED, resolvedByName: '維修員' }),
    ]);
    renderRepairManagement();

    // The default "待處理/處理中" tab hides COMPLETED tickets — switch to
    // "所有工單" so all three statuses are on screen at once.
    fireEvent.click(await screen.findByText('所有工單'));

    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('button', { name: '回覆' })).toHaveLength(3);
  });
});
