import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { AuthProvider } from '../state/auth';
import { BookingsProvider } from '../state/bookings';
import { RepairsProvider } from '../state/repairs';
import { ToastProvider } from './Toast';
import { User, UserRole, Booking, RepairTicket, RepairStatus } from '../types';

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
vi.mock('../services/bookings', () => ({
  fetchBookings: vi.fn(),
  createBooking: vi.fn(),
  updateBooking: vi.fn(),
  deleteBooking: vi.fn(),
  approveBooking: vi.fn(),
  rejectBooking: vi.fn(),
  revertBooking: vi.fn(),
  fetchBookingApprovalHistory: vi.fn(),
}));
vi.mock('../services/repairs', () => ({
  fetchRepairs: vi.fn(),
  createRepairTicket: vi.fn(),
  updateRepairTicket: vi.fn(),
  updateRepairContent: vi.fn(),
  deleteRepairTicket: vi.fn(),
  fetchRepairCategories: vi.fn(),
  createRepairCategory: vi.fn(),
  deleteRepairCategory: vi.fn(),
}));

import * as authService from '../services/auth';
import * as bookingsService from '../services/bookings';
import * as repairsService from '../services/repairs';

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
          <BookingsProvider>
            <RepairsProvider>
              <Layout>
                <div>content</div>
              </Layout>
            </RepairsProvider>
          </BookingsProvider>
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
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue([]);
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([]);
    vi.mocked(repairsService.fetchRepairCategories).mockResolvedValue([]);
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

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1', roomId: 'r1', userId: 'u2', userName: 'Someone',
    title: 'Sync', startTime: '2099-01-01T09:00:00.000Z', endTime: '2099-01-01T10:00:00.000Z',
    status: 'PENDING_APPROVAL',
    ...overrides,
  };
}

function makeRepair(overrides: Partial<RepairTicket> = {}): RepairTicket {
  return {
    id: 'r1', location: '1F', userId: 'u2', userName: 'Someone',
    description: 'Broken', category: 'Hardware', status: RepairStatus.PENDING,
    createdAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Layout — nav badges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repairsService.fetchRepairCategories).mockResolvedValue([]);
  });

  it('shows the pending-count badge on 報修作業中心 and 預約審核 for a FACILITY_MANAGER', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser({ role: UserRole.FACILITY_MANAGER }));
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue([
      makeBooking({ id: 'b1', status: 'PENDING_APPROVAL' }),
      makeBooking({ id: 'b2', status: 'PENDING_APPROVAL' }),
      makeBooking({ id: 'b3', status: 'CONFIRMED' }),
    ]);
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([
      makeRepair({ id: 'r1', status: RepairStatus.PENDING }),
    ]);

    renderLayout();

    const repairLink = await screen.findByRole('link', { name: /報修作業中心/ });
    await waitFor(() => expect(repairLink).toHaveTextContent('1'));
    const approvalsLink = await screen.findByRole('link', { name: /預約審核/ });
    await waitFor(() => expect(approvalsLink).toHaveTextContent('2'));
  });

  it('shows no badge when there is nothing pending', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser({ role: UserRole.ADMIN }));
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue([]);
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([]);

    renderLayout();

    const approvalsLink = await screen.findByRole('link', { name: '預約審核' });
    await waitFor(() => expect(approvalsLink.textContent).toBe('預約審核'));
  });

  it('caps the badge at 99+ for a very large pending count', async () => {
    vi.mocked(authService.fetchCurrentUser).mockResolvedValue(makeUser({ role: UserRole.ADMIN }));
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue(
      Array.from({ length: 150 }, (_, i) => makeBooking({ id: `b${i}`, status: 'PENDING_APPROVAL' })),
    );
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([]);

    renderLayout();

    const approvalsLink = await screen.findByRole('link', { name: /預約審核/ });
    await waitFor(() => expect(approvalsLink).toHaveTextContent('99+'));
  });
});
