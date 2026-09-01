import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { BookingsProvider, useBookingsData } from './bookings';
import { User, UserRole, Booking, AuditLogEntry } from '../types';

vi.mock('./auth', () => ({
  useAuthData: vi.fn(),
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

import { useAuthData } from './auth';
import * as bookingsService from '../services/bookings';

const user: User = { id: 'u1', name: 'Test User', email: 't@school.edu', role: UserRole.USER, avatarUrl: null };
const booking: Booking = {
  id: 'b1', roomId: 'r1', userId: 'u1', userName: 'Test User', title: 'Sync',
  startTime: '2099-01-01T09:00:00.000Z', endTime: '2099-01-01T10:00:00.000Z', status: 'CONFIRMED',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <BookingsProvider>{children}</BookingsProvider>;
}

describe('BookingsProvider / useBookingsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch Bookings when there is no currentUser', () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: null } as ReturnType<typeof useAuthData>);
    renderHook(() => useBookingsData(), { wrapper });

    expect(bookingsService.fetchBookings).not.toHaveBeenCalled();
  });

  it('fetches Bookings once a currentUser is present', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue([booking]);

    const { result } = renderHook(() => useBookingsData(), { wrapper });

    await waitFor(() => expect(result.current.bookings).toEqual([booking]));
  });

  it('deleteBooking removes the Booking from state', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue([booking]);
    vi.mocked(bookingsService.deleteBooking).mockResolvedValue(undefined);

    const { result } = renderHook(() => useBookingsData(), { wrapper });
    await waitFor(() => expect(result.current.bookings).toEqual([booking]));

    await act(async () => {
      await result.current.deleteBooking('b1');
    });

    expect(result.current.bookings).toEqual([]);
  });

  it('approveBooking replaces the Booking with the server response', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue([{ ...booking, status: 'PENDING_APPROVAL' }]);
    vi.mocked(bookingsService.approveBooking).mockResolvedValue(booking);

    const { result } = renderHook(() => useBookingsData(), { wrapper });
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));

    await act(async () => {
      await result.current.approveBooking('b1');
    });

    expect(result.current.bookings[0].status).toBe('CONFIRMED');
  });

  it('revertBooking replaces the Booking with the server response', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue([{ ...booking, status: 'REJECTED' }]);
    vi.mocked(bookingsService.revertBooking).mockResolvedValue({ ...booking, status: 'PENDING_APPROVAL' });

    const { result } = renderHook(() => useBookingsData(), { wrapper });
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));

    await act(async () => {
      await result.current.revertBooking('b1');
    });

    expect(result.current.bookings[0].status).toBe('PENDING_APPROVAL');
    expect(bookingsService.revertBooking).toHaveBeenCalledWith('b1');
  });

  it('fetchApprovalHistory delegates to the service and returns its result', async () => {
    vi.mocked(useAuthData).mockReturnValue({ currentUser: user } as ReturnType<typeof useAuthData>);
    vi.mocked(bookingsService.fetchBookings).mockResolvedValue([]);
    const entries: AuditLogEntry[] = [{
      id: 'e1', actorId: 'u2', actorName: 'Manager', actorEmail: 'm@school.edu',
      action: 'BOOKING_APPROVAL', targetType: 'Booking', targetId: 'b1',
      detail: 'Approved', createdAt: '2099-01-01T00:00:00.000Z',
    }];
    vi.mocked(bookingsService.fetchBookingApprovalHistory).mockResolvedValue(entries);

    const { result } = renderHook(() => useBookingsData(), { wrapper });
    await waitFor(() => expect(result.current.bookings).toEqual([]));

    const history = await result.current.fetchApprovalHistory();
    expect(history).toEqual(entries);
  });
});
