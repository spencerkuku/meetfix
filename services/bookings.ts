import { Booking } from '../types';
import { API_BASE_URL, authHeaders } from './http';

export interface CreateBookingInput {
  roomId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
}

export class BookingConflictError extends Error {}

export async function fetchBookings(): Promise<Booking[]> {
  const res = await fetch(`${API_BASE_URL}/bookings`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch bookings');
  return res.json();
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const res = await fetch(`${API_BASE_URL}/bookings`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  if (res.status === 409) {
    throw new BookingConflictError('This time slot is already booked');
  }
  if (!res.ok) throw new Error('Failed to create booking');
  return res.json();
}

export interface UpdateBookingInput {
  title?: string;
  description?: string;
  roomId?: string;
  startTime?: string;
  endTime?: string;
}

export async function updateBooking(id: string, input: UpdateBookingInput): Promise<Booking> {
  const res = await fetch(`${API_BASE_URL}/bookings/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  if (res.status === 409) {
    throw new BookingConflictError('This time slot is already booked');
  }
  if (!res.ok) throw new Error('Failed to update booking');
  return res.json();
}

export async function deleteBooking(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/bookings/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete booking');
}

export async function approveBooking(id: string): Promise<Booking> {
  const res = await fetch(`${API_BASE_URL}/bookings/${id}/approve`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to approve booking');
  return res.json();
}

export async function rejectBooking(id: string): Promise<Booking> {
  const res = await fetch(`${API_BASE_URL}/bookings/${id}/reject`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to reject booking');
  return res.json();
}
