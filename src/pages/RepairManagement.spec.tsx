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
  getAuthProviders: vi.fn(),
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

describe('RepairManagement — clicking a ticket row opens the detail panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser());
  });

  it('opens the detail panel when a ticket row is clicked', async () => {
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([makeTicket()]);
    renderRepairManagement();

    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1]; // [0] is the header row
    fireEvent.click(row);

    await screen.findByText('維修回覆與備註');
  });

  it('opens the detail panel via keyboard when a focused row gets Enter', async () => {
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([makeTicket()]);
    renderRepairManagement();

    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1];
    fireEvent.keyDown(row, { key: 'Enter' });

    await screen.findByText('維修回覆與備註');
  });

  it('highlights the row currently open in the detail panel', async () => {
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([makeTicket()]);
    renderRepairManagement();

    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1];
    fireEvent.click(row);

    await screen.findByText('維修回覆與備註');
    expect(row.className).toMatch(/bg-blue-50/);
  });

  it('does not open the detail panel when clicking a status action button inside the row', async () => {
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([
      makeTicket({ status: RepairStatus.PENDING }),
    ]);
    vi.mocked(repairsService.updateRepairTicket).mockResolvedValue(
      makeTicket({ status: RepairStatus.IN_PROGRESS }),
    );
    renderRepairManagement();

    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByRole('button', { name: '接手處理' }));

    expect(screen.queryByText('維修回覆與備註')).not.toBeInTheDocument();
  });
});
