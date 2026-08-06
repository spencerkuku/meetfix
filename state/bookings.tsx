import React, { createContext, useContext, useEffect, useState } from 'react';
import { Booking, AuditLogEntry } from '../types';
import {
  fetchBookings,
  createBooking,
  updateBooking as updateBookingApi,
  deleteBooking as deleteBookingApi,
  approveBooking as approveBookingApi,
  rejectBooking as rejectBookingApi,
  revertBooking as revertBookingApi,
  fetchBookingApprovalHistory,
  CreateBookingInput,
  UpdateBookingInput,
} from '../services/bookings';
import { useAuthData } from './auth';

export interface BookingsData {
  bookings: Booking[];
  addBooking: (input: CreateBookingInput) => Promise<void>;
  updateBooking: (id: string, input: UpdateBookingInput) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  approveBooking: (id: string) => Promise<void>;
  rejectBooking: (id: string) => Promise<void>;
  revertBooking: (id: string) => Promise<void>;
  fetchApprovalHistory: () => Promise<AuditLogEntry[]>;
}

const BookingsContext = createContext<BookingsData | undefined>(undefined);

export const useBookingsData = () => {
  const context = useContext(BookingsContext);
  if (!context) throw new Error('useBookingsData must be used within a BookingsProvider');
  return context;
};

export const BookingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuthData();
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setBookings([]);
      return;
    }
    fetchBookings().then(setBookings).catch(() => setBookings([]));
  }, [currentUser]);

  const addBooking = async (input: CreateBookingInput) => {
    const booking = await createBooking(input);
    setBookings(prev => [...prev, booking]);
  };

  const updateBooking = async (id: string, input: UpdateBookingInput) => {
    const booking = await updateBookingApi(id, input);
    setBookings(prev => prev.map(b => b.id === id ? booking : b));
  };

  const deleteBooking = async (id: string) => {
    await deleteBookingApi(id);
    setBookings(prev => prev.filter(b => b.id !== id));
  };

  const approveBooking = async (id: string) => {
    const booking = await approveBookingApi(id);
    setBookings(prev => prev.map(b => b.id === id ? booking : b));
  };

  const rejectBooking = async (id: string) => {
    const booking = await rejectBookingApi(id);
    setBookings(prev => prev.map(b => b.id === id ? booking : b));
  };

  const revertBooking = async (id: string) => {
    const booking = await revertBookingApi(id);
    setBookings(prev => prev.map(b => b.id === id ? booking : b));
  };

  const fetchApprovalHistory = () => fetchBookingApprovalHistory();

  return (
    <BookingsContext.Provider value={{ bookings, addBooking, updateBooking, deleteBooking, approveBooking, rejectBooking, revertBooking, fetchApprovalHistory }}>
      {children}
    </BookingsContext.Provider>
  );
};
