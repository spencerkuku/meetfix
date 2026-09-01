import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BookingFormModal, BookingFormTarget } from './BookingFormModal';
import { ToastProvider } from '../components/Toast';
import { Booking, Room } from '../types';

const room: Room = {
  id: 'room-1',
  name: 'Test Room',
  location: '1F',
  capacity: 4,
  equipment: [],
  requiresApproval: false,
};

function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function renderModal(
  target: BookingFormTarget,
  overrides: Partial<React.ComponentProps<typeof BookingFormModal>> = {},
) {
  const addBooking = overrides.addBooking ?? vi.fn().mockResolvedValue(undefined);
  const updateBooking = overrides.updateBooking ?? vi.fn().mockResolvedValue(undefined);
  const deleteBooking = overrides.deleteBooking ?? vi.fn().mockResolvedValue(undefined);
  const onClose = overrides.onClose ?? vi.fn();

  const utils = render(
    <ToastProvider>
      <BookingFormModal
        target={target}
        rooms={overrides.rooms ?? [room]}
        activeBookings={overrides.activeBookings ?? []}
        addBooking={addBooking}
        updateBooking={updateBooking}
        deleteBooking={deleteBooking}
        onClose={onClose}
      />
    </ToastProvider>,
  );
  return { ...utils, addBooking, updateBooking, deleteBooking, onClose };
}

describe('BookingFormModal — create mode', () => {
  it('submits a new Booking with the prefilled Slot and calls onClose on success', async () => {
    const { addBooking, onClose } = renderModal({
      mode: 'create',
      date: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      roomId: room.id,
    });

    fireEvent.change(screen.getByPlaceholderText('例如：Q4 策略會議'), {
      target: { value: 'Planning meeting' },
    });
    fireEvent.click(screen.getByText('確認預約'));

    await waitFor(() => expect(addBooking).toHaveBeenCalledTimes(1));
    expect(addBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: room.id,
        title: 'Planning meeting',
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks a Room unavailable when it conflicts with an existing active Booking', () => {
    const conflicting: Booking = {
      id: 'existing',
      roomId: room.id,
      userId: 'someone-else',
      userName: 'Someone Else',
      title: 'Existing meeting',
      // Local time, matching how the form itself builds Dates from
      // date+time fields (new Date(`${date}T${startTime}`), no 'Z') — a
      // UTC-suffixed literal here would only overlap by coincidence,
      // depending on the test runner's timezone.
      startTime: new Date('2099-01-01T10:00').toISOString(),
      endTime: new Date('2099-01-01T11:00').toISOString(),
      status: 'CONFIRMED',
    };
    renderModal(
      { mode: 'create', date: '2099-01-01', startTime: '10:00', endTime: '11:00', roomId: room.id },
      { activeBookings: [conflicting] },
    );

    expect(screen.getByText('已佔用')).toBeInTheDocument();
  });
});

describe('BookingFormModal — edit mode', () => {
  function editableBooking(overrides: Partial<Booking> = {}): Booking {
    return {
      id: 'b1',
      roomId: room.id,
      userId: 'user-1',
      userName: 'Test User',
      title: 'Team sync',
      description: '',
      startTime: futureIso(1),
      endTime: futureIso(2),
      status: 'CONFIRMED',
      ...overrides,
    };
  }

  it('renders an editable, still-active Booking with its fields enabled and a delete action', () => {
    const booking = editableBooking();
    renderModal({ mode: 'edit', booking });

    const titleInput = screen.getByDisplayValue('Team sync') as HTMLInputElement;
    expect(titleInput).not.toBeDisabled();
    expect(screen.getByText('儲存變更')).toBeInTheDocument();
    expect(screen.getByText('刪除此預約')).toBeInTheDocument();
  });

  it('disables the fields and hides the save action for a no-longer-editable Booking (REJECTED)', () => {
    const booking = editableBooking({ status: 'REJECTED' });
    renderModal({ mode: 'edit', booking });

    const titleInput = screen.getByDisplayValue('Team sync') as HTMLInputElement;
    expect(titleInput).toBeDisabled();
    expect(screen.queryByText('儲存變更')).not.toBeInTheDocument();
    // Still in the future, so still deletable even though not editable —
    // matches isDeletable's "any status" rule.
    expect(screen.getByText('刪除此預約')).toBeInTheDocument();
  });

  it('hides the delete action once the Booking has started (in-progress)', () => {
    const booking = editableBooking({
      startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    renderModal({ mode: 'edit', booking });

    expect(screen.queryByText('刪除此預約')).not.toBeInTheDocument();
  });

  it('calls deleteBooking and onClose when the delete action is confirmed', async () => {
    const booking = editableBooking();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { deleteBooking, onClose } = renderModal({ mode: 'edit', booking });

    fireEvent.click(screen.getByText('刪除此預約'));

    await waitFor(() => expect(deleteBooking).toHaveBeenCalledWith(booking.id));
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it('does not call deleteBooking when the confirmation is declined', () => {
    const booking = editableBooking();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { deleteBooking } = renderModal({ mode: 'edit', booking });

    fireEvent.click(screen.getByText('刪除此預約'));

    expect(deleteBooking).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
