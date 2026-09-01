import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { RoomFilterMenu } from './RoomFilterMenu';
import { Room } from '../types';

const roomA: Room = { id: 'room-a', name: 'Room A', location: '1F', capacity: 4, equipment: [], requiresApproval: false };
const roomB: Room = { id: 'room-b', name: 'Room B', location: '1F', capacity: 4, equipment: [], requiresApproval: false };
const roomC: Room = { id: 'room-c', name: 'Room C', location: '2F', capacity: 4, equipment: [], requiresApproval: false };
const rooms = [roomA, roomB, roomC];

function openMenu(getByRole: ReturnType<typeof render>['getByRole']) {
  fireEvent.click(getByRole('button', { name: /會議室|已選/ }));
}

describe('RoomFilterMenu — trigger label', () => {
  it('shows "所有會議室" when selectedRoomIds is "ALL"', () => {
    const { getByRole } = render(<RoomFilterMenu rooms={rooms} selectedRoomIds="ALL" onChange={vi.fn()} />);
    expect(getByRole('button', { name: '所有會議室' })).toBeTruthy();
  });

  it('shows a count when selectedRoomIds is a partial subset', () => {
    const { getByRole } = render(
      <RoomFilterMenu rooms={rooms} selectedRoomIds={[roomA.id, roomB.id]} onChange={vi.fn()} />,
    );
    expect(getByRole('button', { name: '已選 2 間' })).toBeTruthy();
  });
});

describe('RoomFilterMenu — dropdown checkbox list', () => {
  it('checks every Room when selectedRoomIds is "ALL"', () => {
    const { getByRole } = render(<RoomFilterMenu rooms={rooms} selectedRoomIds="ALL" onChange={vi.fn()} />);
    openMenu(getByRole);
    for (const room of rooms) {
      expect((getByRole('checkbox', { name: room.name }) as HTMLInputElement).checked).toBe(true);
    }
  });

  it('only checks the Rooms named in a subset array', () => {
    const { getByRole } = render(
      <RoomFilterMenu rooms={rooms} selectedRoomIds={[roomA.id]} onChange={vi.fn()} />,
    );
    openMenu(getByRole);
    expect((getByRole('checkbox', { name: roomA.name }) as HTMLInputElement).checked).toBe(true);
    expect((getByRole('checkbox', { name: roomB.name }) as HTMLInputElement).checked).toBe(false);
    expect((getByRole('checkbox', { name: roomC.name }) as HTMLInputElement).checked).toBe(false);
  });

  it('adds a Room to the selection when its checkbox is checked from a subset', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <RoomFilterMenu rooms={rooms} selectedRoomIds={[roomA.id]} onChange={onChange} />,
    );
    openMenu(getByRole);
    fireEvent.click(getByRole('checkbox', { name: roomB.name }));
    expect(onChange).toHaveBeenCalledWith([roomA.id, roomB.id]);
  });

  it('removes a Room from the selection when its checkbox is unchecked from a subset', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <RoomFilterMenu rooms={rooms} selectedRoomIds={[roomA.id, roomB.id]} onChange={onChange} />,
    );
    openMenu(getByRole);
    fireEvent.click(getByRole('checkbox', { name: roomA.name }));
    expect(onChange).toHaveBeenCalledWith([roomB.id]);
  });

  it('collapses to "ALL" when checking a Room completes the full set', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <RoomFilterMenu rooms={rooms} selectedRoomIds={[roomA.id, roomB.id]} onChange={onChange} />,
    );
    openMenu(getByRole);
    fireEvent.click(getByRole('checkbox', { name: roomC.name }));
    expect(onChange).toHaveBeenCalledWith('ALL');
  });

  it('unchecking one Room while at "ALL" narrows to every other Room as an explicit array', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<RoomFilterMenu rooms={rooms} selectedRoomIds="ALL" onChange={onChange} />);
    openMenu(getByRole);
    fireEvent.click(getByRole('checkbox', { name: roomB.name }));
    expect(onChange).toHaveBeenCalledWith([roomA.id, roomC.id]);
  });
});

describe('RoomFilterMenu — select all / deselect all', () => {
  it('calls onChange("ALL") when 全選 is clicked', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <RoomFilterMenu rooms={rooms} selectedRoomIds={[roomA.id]} onChange={onChange} />,
    );
    openMenu(getByRole);
    fireEvent.click(getByRole('button', { name: '全選' }));
    expect(onChange).toHaveBeenCalledWith('ALL');
  });

  it('calls onChange([]) when 取消全選 is clicked', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<RoomFilterMenu rooms={rooms} selectedRoomIds="ALL" onChange={onChange} />);
    openMenu(getByRole);
    fireEvent.click(getByRole('button', { name: '取消全選' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
