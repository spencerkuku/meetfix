import { Booking, AuditLogEntry } from '../types';
import { apiFetch, ApiError } from './http';

export interface CreateBookingInput {
  roomId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
}

export class BookingConflictError extends Error {}

export async function fetchBookings(): Promise<Booking[]> {
  return apiFetch<Booking[]>('/bookings', { fallbackMessage: 'Failed to fetch bookings' });
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  try {
    return await apiFetch<Booking>('/bookings', {
      method: 'POST',
      json: true,
      body: JSON.stringify(input),
      fallbackMessage: 'Failed to create booking',
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      throw new BookingConflictError('This time slot is already booked');
    }
    throw err;
  }
}

export interface UpdateBookingInput {
  title?: string;
  description?: string;
  roomId?: string;
  startTime?: string;
  endTime?: string;
}

export async function updateBooking(id: string, input: UpdateBookingInput): Promise<Booking> {
  try {
    return await apiFetch<Booking>(`/bookings/${id}`, {
      method: 'PATCH',
      json: true,
      body: JSON.stringify(input),
      fallbackMessage: 'Failed to update booking',
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      throw new BookingConflictError('This time slot is already booked');
    }
    throw err;
  }
}

export async function deleteBooking(id: string): Promise<void> {
  return apiFetch<void>(`/bookings/${id}`, {
    method: 'DELETE',
    parseJson: false,
    fallbackMessage: 'Failed to delete booking',
  });
}

export async function approveBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/approve`, {
    method: 'PATCH',
    fallbackMessage: 'Failed to approve booking',
  });
}

export async function rejectBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/reject`, {
    method: 'PATCH',
    fallbackMessage: 'Failed to reject booking',
  });
}

export class BookingRevertConflictError extends Error {}

export async function revertBooking(id: string): Promise<Booking> {
  try {
    return await apiFetch<Booking>(`/bookings/${id}/revert`, {
      method: 'PATCH',
      fallbackMessage: 'This Booking could not be reverted',
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      throw new BookingRevertConflictError(err.message);
    }
    throw err;
  }
}

export async function fetchBookingApprovalHistory(): Promise<AuditLogEntry[]> {
  return apiFetch<AuditLogEntry[]>('/bookings/approval-history', {
    fallbackMessage: 'Failed to fetch booking approval history',
  });
}
