import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AdminProvider, useAdminData } from './admin';
import { User, UserRole, AccountStatus, AdminUser } from '../types';

vi.mock('./auth', () => ({
  useAuthData: vi.fn(),
}));
vi.mock('../services/admin', () => ({
  fetchUsers: vi.fn(),
  updateUserRole: vi.fn(),
  updateUserStatus: vi.fn(),
  deleteUser: vi.fn(),
  fetchPendingAccounts: vi.fn(),
  approveAccount: vi.fn(),
  fetchAutoApprovedDomains: vi.fn(),
  addAutoApprovedDomain: vi.fn(),
  updateAutoApprovedDomain: vi.fn(),
  removeAutoApprovedDomain: vi.fn(),
}));
vi.mock('../services/audit', () => ({
  fetchAuditLog: vi.fn(),
}));

import { useAuthData } from './auth';
import * as adminService from '../services/admin';
import * as auditService from '../services/audit';

const adminUser: User = { id: 'admin-1', name: 'Admin', email: 'admin@school.edu', role: UserRole.ADMIN, avatarUrl: null };
const plainUser: User = { id: 'u1', name: 'User', email: 'u@school.edu', role: UserRole.USER, avatarUrl: null };
const adminUserRow: AdminUser = {
  ...adminUser, accountStatus: AccountStatus.ACTIVE, googleLinked: false, hasPassword: true, bookingCount: 0, repairTicketCount: 0,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AdminProvider>{children}</AdminProvider>;
}

describe('AdminProvider / useAdminData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch Admin data when there is no currentUser', () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: null } as ReturnType<typeof useAuthData>);
    renderHook(() => useAdminData(), { wrapper });

    expect(adminService.fetchUsers).not.toHaveBeenCalled();
  });

  it('does not fetch Admin data for a non-ADMIN currentUser', () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: plainUser } as ReturnType<typeof useAuthData>);
    renderHook(() => useAdminData(), { wrapper });

    expect(adminService.fetchUsers).not.toHaveBeenCalled();
    expect(auditService.fetchAuditLog).not.toHaveBeenCalled();
  });

  it('fetches Users/PendingAccounts/AutoApprovedDomains/AuditLog for an ADMIN currentUser', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: adminUser } as ReturnType<typeof useAuthData>);
    vi.mocked(adminService.fetchUsers).mockResolvedValue([adminUserRow]);
    vi.mocked(adminService.fetchPendingAccounts).mockResolvedValue([]);
    vi.mocked(adminService.fetchAutoApprovedDomains).mockResolvedValue([]);
    vi.mocked(auditService.fetchAuditLog).mockResolvedValue([]);

    const { result } = renderHook(() => useAdminData(), { wrapper });

    await waitFor(() => expect(result.current.users).toEqual([adminUserRow]));
  });

  it('deleteUser removes the User from state', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: adminUser } as ReturnType<typeof useAuthData>);
    vi.mocked(adminService.fetchUsers).mockResolvedValue([adminUserRow]);
    vi.mocked(adminService.fetchPendingAccounts).mockResolvedValue([]);
    vi.mocked(adminService.fetchAutoApprovedDomains).mockResolvedValue([]);
    vi.mocked(auditService.fetchAuditLog).mockResolvedValue([]);
    vi.mocked(adminService.deleteUser).mockResolvedValue(undefined);

    const { result } = renderHook(() => useAdminData(), { wrapper });
    await waitFor(() => expect(result.current.users).toEqual([adminUserRow]));

    await act(async () => {
      await result.current.deleteUser(adminUserRow.id);
    });

    expect(result.current.users).toEqual([]);
  });
});
