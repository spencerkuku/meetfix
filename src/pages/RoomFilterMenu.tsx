import React, { useEffect, useRef, useState } from 'react';
import { Room } from '../types';
import { Filter, ChevronDown } from 'lucide-react';

export interface RoomFilterMenuProps {
  rooms: Room[];
  selectedRoomIds: string[] | 'ALL';
  onChange: (selection: string[] | 'ALL') => void;
}

// Multi-select Room filter for the Booking calendar toolbar. Kept
// presentational — it owns only its own open/closed state; the selection
// itself, its persistence, and what "ALL" means to the calendar grid all
// live with the caller.
export const RoomFilterMenu: React.FC<RoomFilterMenuProps> = ({ rooms, selectedRoomIds, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  const isChecked = (roomId: string) => selectedRoomIds === 'ALL' || selectedRoomIds.includes(roomId);

  const toggleRoom = (roomId: string) => {
    const currentIds = selectedRoomIds === 'ALL' ? rooms.map(r => r.id) : selectedRoomIds;
    const nextIds = currentIds.includes(roomId)
      ? currentIds.filter(id => id !== roomId)
      : [...currentIds, roomId];
    onChange(nextIds.length === rooms.length ? 'ALL' : nextIds);
  };

  const triggerLabel = selectedRoomIds === 'ALL' ? '所有會議室' : `已選 ${selectedRoomIds.length} 間`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className="flex items-center bg-white border rounded-lg px-3 py-1.5 shadow-sm text-sm text-slate-700 cursor-pointer min-w-[120px]"
      >
        <Filter size={16} className="text-slate-400 mr-2" />
        <span className="flex-1 text-left">{triggerLabel}</span>
        <ChevronDown size={16} className="text-slate-400 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-56 bg-white border rounded-lg shadow-lg p-2">
          <div className="flex justify-between gap-2 pb-2 mb-2 border-b border-gray-100">
            <button
              type="button"
              onClick={() => onChange('ALL')}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              全選
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              取消全選
            </button>
          </div>
          <div className="max-h-64 overflow-auto space-y-1">
            {rooms.map(room => (
              <label
                key={room.id}
                className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={isChecked(room.id)}
                  onChange={() => toggleRoom(room.id)}
                  className="cursor-pointer"
                />
                <span className="truncate">{room.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
