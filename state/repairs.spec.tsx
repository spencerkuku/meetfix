import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { RepairsProvider, useRepairsData } from './repairs';
import { User, UserRole, RepairTicket, RepairCategory, RepairStatus } from '../types';

vi.mock('./auth', () => ({
  useAuthData: vi.fn(),
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

import { useAuthData } from './auth';
import * as repairsService from '../services/repairs';

const user: User = { id: 'u1', name: 'Test User', email: 't@school.edu', role: UserRole.USER, avatarUrl: null };
const category: RepairCategory = { id: 'c1', name: '硬體設備' };
const ticket: RepairTicket = {
  id: 't1', location: 'A101', category: '硬體設備', description: 'broken',
  status: RepairStatus.PENDING, userName: 'Test User', userId: 'u1', createdAt: '2026-01-01T00:00:00.000Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <RepairsProvider>{children}</RepairsProvider>;
}

describe('RepairsProvider / useRepairsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch Repair Tickets or Categories when there is no currentUser', () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: null } as ReturnType<typeof useAuthData>);
    renderHook(() => useRepairsData(), { wrapper });

    expect(repairsService.fetchRepairs).not.toHaveBeenCalled();
    expect(repairsService.fetchRepairCategories).not.toHaveBeenCalled();
  });

  it('fetches both Repair Tickets and Categories once a currentUser is present', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([ticket]);
    vi.mocked(repairsService.fetchRepairCategories).mockResolvedValue([category]);

    const { result } = renderHook(() => useRepairsData(), { wrapper });

    await waitFor(() => expect(result.current.repairs).toEqual([ticket]));
    expect(result.current.repairCategories).toEqual([category]);
  });

  it('addRepairCategory appends the created Category to state', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(repairsService.fetchRepairs).mockResolvedValue([]);
    vi.mocked(repairsService.fetchRepairCategories).mockResolvedValue([]);
    const newCategory: RepairCategory = { id: 'c2', name: '冷氣空調' };
    vi.mocked(repairsService.createRepairCategory).mockResolvedValue(newCategory);

    const { result } = renderHook(() => useRepairsData(), { wrapper });
    await waitFor(() => expect(result.current.repairCategories).toEqual([]));

    await act(async () => {
      await result.current.addRepairCategory('冷氣空調');
    });

    expect(result.current.repairCategories).toEqual([newCategory]);
  });
});
