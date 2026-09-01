import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { RoomsProvider, useRoomsData } from './rooms';
import { User, UserRole, Room } from '../types';

vi.mock('./auth', () => ({
  useAuthData: vi.fn(),
}));
vi.mock('../services/rooms', () => ({
  fetchRooms: vi.fn(),
  createRoom: vi.fn(),
  updateRoomApi: vi.fn(),
  deleteRoomApi: vi.fn(),
}));

import { useAuthData } from './auth';
import * as roomsService from '../services/rooms';

const user: User = { id: 'u1', name: 'Test User', email: 't@school.edu', role: UserRole.USER, avatarUrl: null };
const room: Room = { id: 'r1', name: 'Room 1', location: '1F', capacity: 4, equipment: [], requiresApproval: false };

function wrapper({ children }: { children: React.ReactNode }) {
  return <RoomsProvider>{children}</RoomsProvider>;
}

describe('RoomsProvider / useRoomsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch Rooms when there is no currentUser', () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: null } as ReturnType<typeof useAuthData>);
    renderHook(() => useRoomsData(), { wrapper });

    expect(roomsService.fetchRooms).not.toHaveBeenCalled();
  });

  it('fetches Rooms once a currentUser is present', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(roomsService.fetchRooms).mockResolvedValue([room]);

    const { result } = renderHook(() => useRoomsData(), { wrapper });

    await waitFor(() => expect(result.current.rooms).toEqual([room]));
  });

  it('addRoom appends the created Room to state', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(roomsService.fetchRooms).mockResolvedValue([]);
    const newRoom: Room = { ...room, id: 'r2', name: 'Room 2' };
    vi.mocked(roomsService.createRoom).mockResolvedValue(newRoom);

    const { result } = renderHook(() => useRoomsData(), { wrapper });
    await waitFor(() => expect(result.current.rooms).toEqual([]));

    await act(async () => {
      await result.current.addRoom({ name: 'Room 2', location: '2F', equipment: [], requiresApproval: false });
    });

    expect(result.current.rooms).toEqual([newRoom]);
  });
});
