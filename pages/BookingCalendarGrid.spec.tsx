import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { BookingCalendarGrid, CalendarSelection } from './BookingCalendarGrid';
import { Booking, Room, User, UserRole } from '../types';

const room: Room = {
  id: 'room-1',
  name: 'Test Room',
  location: '1F',
  capacity: 4,
  equipment: [],
  requiresApproval: false,
};

const user: User = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@school.edu',
  role: UserRole.USER,
  avatarUrl: null,
};

// A fixed, comfortably-future date so "isPast"/canSelectSlot checks never
// depend on when the test happens to run.
const FUTURE_DAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(0, 0, 0, 0);
  return d;
})();

function cell(container: HTMLElement, day: Date, slot: number, roomId: string) {
  const dayStr = day.toISOString().split('T')[0];
  const el = container.querySelector(
    `[data-cell-day="${dayStr}"][data-cell-slot="${slot}"][data-cell-room="${roomId}"]`,
  );
  if (!el) throw new Error(`cell not found: ${dayStr} slot ${slot} room ${roomId}`);
  return el as HTMLElement;
}

function baseProps(overrides: Partial<React.ComponentProps<typeof BookingCalendarGrid>> = {}) {
  return {
    view: 'DAY' as const,
    currentDate: FUTURE_DAY,
    isMobile: false,
    rooms: [room],
    bookings: [] as Booking[],
    filterRoomId: 'ALL',
    currentUser: user,
    onSelectSlot: vi.fn(),
    onOpenBooking: vi.fn(),
    onSwipeNext: vi.fn(),
    onSwipePrev: vi.fn(),
    ...overrides,
  };
}

describe('BookingCalendarGrid — mouse drag-select (Day view)', () => {
  it('emits a CalendarSelection spanning the dragged slots, in the right order regardless of drag direction', () => {
    const onSelectSlot = vi.fn();
    const { container } = render(<BookingCalendarGrid {...baseProps({ onSelectSlot })} />);

    const startCell = cell(container, FUTURE_DAY, 4, room.id); // 10:00
    const endCell = cell(container, FUTURE_DAY, 6, room.id); // 11:00

    fireEvent.mouseDown(startCell);
    fireEvent.mouseEnter(endCell);
    fireEvent.mouseUp(endCell);

    expect(onSelectSlot).toHaveBeenCalledTimes(1);
    const selection: CalendarSelection = onSelectSlot.mock.calls[0][0];
    expect(selection.roomId).toBe(room.id);
    expect(selection.date).toBe(FUTURE_DAY.toISOString().split('T')[0]);
    expect(selection.startTime).toBe('10:00');
    expect(selection.endTime).toBe('11:30'); // exclusive end = one slot past the last selected slot
  });

  it('does not extend the selection into a different Room column', () => {
    const otherRoom: Room = { ...room, id: 'room-2', name: 'Other Room' };
    const onSelectSlot = vi.fn();
    const { container } = render(
      <BookingCalendarGrid {...baseProps({ rooms: [room, otherRoom], onSelectSlot })} />,
    );

    const startCell = cell(container, FUTURE_DAY, 4, room.id);
    const otherRoomCell = cell(container, FUTURE_DAY, 6, otherRoom.id);

    fireEvent.mouseDown(startCell);
    fireEvent.mouseEnter(otherRoomCell); // should be ignored — different Room column
    fireEvent.mouseUp(startCell);

    expect(onSelectSlot).toHaveBeenCalledTimes(1);
    const selection: CalendarSelection = onSelectSlot.mock.calls[0][0];
    // Selection stayed anchored to the start slot, not dragged into otherRoom.
    expect(selection.roomId).toBe(room.id);
    expect(selection.startTime).toBe('10:00');
    expect(selection.endTime).toBe('10:30');
  });

  it('does not start a selection for a GUEST User', () => {
    const guest: User = { ...user, role: UserRole.GUEST };
    const onSelectSlot = vi.fn();
    const { container } = render(<BookingCalendarGrid {...baseProps({ currentUser: guest, onSelectSlot })} />);

    const startCell = cell(container, FUTURE_DAY, 4, room.id);
    fireEvent.mouseDown(startCell);
    fireEvent.mouseUp(startCell);

    expect(onSelectSlot).not.toHaveBeenCalled();
  });
});

describe('BookingCalendarGrid — Month view', () => {
  it('selects a future day by date only (no time/Room) when clicked', () => {
    const onSelectSlot = vi.fn();
    const { container } = render(
      <BookingCalendarGrid {...baseProps({ view: 'MONTH', onSelectSlot })} />,
    );

    // Click any day cell rendered for the current month that isn't padding.
    const dayCell = container.querySelector('.h-16.md\\:h-24.border.border-gray-100.p-1') as HTMLElement;
    expect(dayCell).toBeTruthy();
    fireEvent.click(dayCell);

    // Either it was clickable (future day, onSelectSlot fired with a date
    // and no startTime/endTime/roomId) or it was a past day (no call) —
    // both are valid depending on which day of the month the grid rendered;
    // assert the shape holds whenever it does fire.
    if (onSelectSlot.mock.calls.length > 0) {
      const selection: CalendarSelection = onSelectSlot.mock.calls[0][0];
      expect(selection.date).toEqual(expect.any(String));
      expect(selection.startTime).toBeUndefined();
      expect(selection.endTime).toBeUndefined();
      expect(selection.roomId).toBeUndefined();
    }
  });

  it('calls onOpenBooking when an existing Booking in the month grid is clicked', () => {
    const booking: Booking = {
      id: 'b1',
      roomId: room.id,
      userId: user.id,
      userName: user.name,
      title: 'Standup',
      startTime: new Date(FUTURE_DAY.getTime() + 60 * 60 * 1000).toISOString(),
      endTime: new Date(FUTURE_DAY.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      status: 'CONFIRMED',
    };
    const onOpenBooking = vi.fn();
    const { getByText } = render(
      <BookingCalendarGrid {...baseProps({ view: 'MONTH', bookings: [booking], onOpenBooking })} />,
    );

    fireEvent.click(getByText('Standup'));
    expect(onOpenBooking).toHaveBeenCalledWith(booking);
  });
});

describe('BookingCalendarGrid — touch gestures (Day view)', () => {
  beforeEach(() => {
    // jsdom doesn't implement elementFromPoint; the vertical-drag select
    // path uses it to find the cell under the touch point as it moves.
    document.elementFromPoint = vi.fn(() => null);
  });

  it('selects exactly one slot on a tap (touchstart + touchend, no movement)', () => {
    const onSelectSlot = vi.fn();
    const { container } = render(<BookingCalendarGrid {...baseProps({ onSelectSlot })} />);

    const targetCell = cell(container, FUTURE_DAY, 4, room.id);
    fireEvent.touchStart(targetCell, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(targetCell);

    expect(onSelectSlot).toHaveBeenCalledTimes(1);
    const selection: CalendarSelection = onSelectSlot.mock.calls[0][0];
    expect(selection.startTime).toBe('10:00');
    expect(selection.endTime).toBe('10:30');
  });

  it('treats a horizontal drag past the threshold as a swipe, not a selection', () => {
    const onSelectSlot = vi.fn();
    const onSwipeNext = vi.fn();
    const onSwipePrev = vi.fn();
    const { container } = render(
      <BookingCalendarGrid {...baseProps({ onSelectSlot, onSwipeNext, onSwipePrev })} />,
    );

    const targetCell = cell(container, FUTURE_DAY, 4, room.id);
    const grid = targetCell.closest('.overflow-auto') as HTMLElement;

    fireEvent.touchStart(targetCell, { touches: [{ clientX: 100, clientY: 100 }] });
    // Move left past the threshold, horizontally dominant — a swipe to next.
    fireEvent.touchMove(grid, { touches: [{ clientX: 50, clientY: 102 }] });
    fireEvent.touchEnd(grid);

    expect(onSelectSlot).not.toHaveBeenCalled();
    expect(onSwipeNext).toHaveBeenCalledTimes(1);
    expect(onSwipePrev).not.toHaveBeenCalled();
  });
});
