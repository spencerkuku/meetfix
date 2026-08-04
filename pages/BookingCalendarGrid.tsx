import React, { useState, useEffect, useRef } from 'react';
import { CalendarViewType, Booking, Room, User, UserRole } from '../types';
import { Clock, Monitor, Users, AlignLeft } from 'lucide-react';

// The day/week grid runs 8:00-20:00 in 30-minute increments — slot 0 is
// 8:00, slot 1 is 8:30, ... slot 23 is 19:30 (24 slots).
const SLOTS_PER_DAY = 24;
const GRID_START_HOUR = 8;

function slotToTime(slot: number): { hour: number; minute: number } {
  return { hour: GRID_START_HOUR + Math.floor(slot / 2), minute: (slot % 2) * 30 };
}

function formatSlotTime(slot: number): string {
  const { hour, minute } = slotToTime(slot);
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function slotDate(day: Date, slot: number): Date {
  const { hour, minute } = slotToTime(slot);
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// A single cell in the calendar grid: a day, a 30-minute slot, and (for the
// per-Room-column layout) which Room's column it belongs to.
type SlotRef = { day: Date; slot: number; roomId: string };

// What the grid asks its caller to do once a selection is complete — either
// a Slot range (week/day drag-select or tap) or just a date (month view,
// where a day cell click carries no time/Room of its own).
export interface CalendarSelection {
  date: string;
  startTime?: string;
  endTime?: string;
  roomId?: string;
}

export interface BookingCalendarGridProps {
  view: CalendarViewType;
  currentDate: Date;
  isMobile: boolean;
  rooms: Room[];
  bookings: Booking[];
  filterRoomId: string;
  currentUser: User | null;
  onSelectSlot: (selection: CalendarSelection) => void;
  onOpenBooking: (booking: Booking) => void;
  onSwipeNext: () => void;
  onSwipePrev: () => void;
}

// Renders the Booking calendar's Month/Week/Day grid and owns everything
// about turning a mouse drag or a touch gesture into a Slot selection: drag
// state, the touch start/move/end disambiguator (vertical drag = select,
// horizontal drag = swipe day, single-day views only), the hover tooltip,
// and the current-time red line. Callers only see the result — a
// CalendarSelection when the User picks a range, or an existing Booking
// when they click one to open it.
export const BookingCalendarGrid: React.FC<BookingCalendarGridProps> = ({
  view,
  currentDate,
  isMobile,
  rooms,
  bookings: displayedBookings,
  filterRoomId,
  currentUser,
  onSelectSlot,
  onOpenBooking,
  onSwipeNext,
  onSwipePrev,
}) => {
  // Current Time Line State
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Height of the sticky day-of-week header row, measured so the Room
  // sub-header (per-column Room name, shown when multiple Rooms are
  // displayed side by side) can stick right below it. Without this, the
  // Room names scroll out of view with the rest of the grid and there's
  // nothing left in a scrolled column to say which Room it belongs to.
  const dayHeaderRef = useRef<HTMLDivElement>(null);
  const [dayHeaderHeight, setDayHeaderHeight] = useState(0);
  useEffect(() => {
    const el = dayHeaderRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setDayHeaderHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, [view, isMobile]);

  const isSingleDayMode = () => view === 'DAY' || (view === 'WEEK' && isMobile);

  // Drag Selection (Create) State
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectStart, setSelectStart] = useState<SlotRef | null>(null);
  const [selectEnd, setSelectEnd] = useState<SlotRef | null>(null);

  // Tooltip State
  const [hoveredBooking, setHoveredBooking] = useState<Booking | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const handleBookingMouseEnter = (e: React.MouseEvent, booking: Booking) => {
    setHoveredBooking(booking);
    updateTooltipPosition(e);
  };
  const handleBookingMouseMove = (e: React.MouseEvent) => {
    updateTooltipPosition(e);
  };
  const handleBookingMouseLeave = () => {
    setHoveredBooking(null);
  };
  const updateTooltipPosition = (e: React.MouseEvent) => {
    setTooltipPosition({ x: e.clientX + 15, y: e.clientY + 15 });
  };

  // --- Drag Selection (Create) Logic ---

  // Whether a slot is a legal drag-select start: signed in, not a GUEST,
  // and not in the past.
  const canSelectSlot = (ref: SlotRef): boolean => {
    if (!currentUser || currentUser.role === UserRole.GUEST) return false;
    return slotDate(ref.day, ref.slot) >= new Date();
  };

  const finishSelection = (start: SlotRef, otherSlot: number) => {
    const minSlot = Math.min(start.slot, otherSlot);
    const maxSlot = Math.max(start.slot, otherSlot);
    onSelectSlot({
      date: start.day.toISOString().split('T')[0],
      startTime: formatSlotTime(minSlot),
      endTime: formatSlotTime(maxSlot + 1),
      roomId: start.roomId,
    });
  };

  const beginSelect = (ref: SlotRef) => {
    setIsSelecting(true);
    setSelectStart(ref);
    setSelectEnd(ref);
  };

  const handleMouseDown = (ref: SlotRef) => {
    if (!canSelectSlot(ref)) return;
    beginSelect(ref);
  };

  const handleMouseEnter = (ref: SlotRef) => {
    if (isSelecting && selectStart) {
      // Only allow dragging within the same day and Room column
      if (ref.day.toDateString() === selectStart.day.toDateString() && ref.roomId === selectStart.roomId) {
        setSelectEnd(ref);
      }
    }
  };

  const handleMouseUp = () => {
    if (isSelecting && selectStart && selectEnd) {
      setIsSelecting(false);
      finishSelection(selectStart, selectEnd.slot);
    }
    setSelectStart(null);
    setSelectEnd(null);
  };

  // --- Touch Support (mirrors the mouse drag-select above, plus swipe) ---
  //
  // A touch that starts on a grid cell is ambiguous until it moves: a
  // vertical drag means "select a time range" (like mouse drag), a
  // horizontal drag means "swipe to the next/previous day" (single-day
  // views only). We disambiguate by whichever axis moves past a small
  // threshold first, then commit to that gesture for the rest of the touch.
  const TOUCH_GESTURE_THRESHOLD = 10; // px
  const touchGestureRef = useRef<(SlotRef & {
    startX: number;
    startY: number;
    canSelect: boolean;
    mode: 'pending' | 'select' | 'swipe';
    lastDx: number;
  }) | null>(null);

  const handleCellTouchStart = (e: React.TouchEvent, ref: SlotRef) => {
    const touch = e.touches[0];
    touchGestureRef.current = {
      ...ref,
      startX: touch.clientX,
      startY: touch.clientY,
      canSelect: canSelectSlot(ref),
      mode: 'pending',
      lastDx: 0,
    };
  };

  const handleGridTouchMove = (e: React.TouchEvent) => {
    const g = touchGestureRef.current;
    if (!g) return;
    const touch = e.touches[0];
    const dx = touch.clientX - g.startX;
    const dy = touch.clientY - g.startY;
    g.lastDx = dx;

    if (g.mode === 'pending') {
      if (g.canSelect && Math.abs(dy) > TOUCH_GESTURE_THRESHOLD && Math.abs(dy) >= Math.abs(dx)) {
        g.mode = 'select';
        beginSelect(g);
      } else if (isSingleDayMode() && Math.abs(dx) > TOUCH_GESTURE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        g.mode = 'swipe';
      }
    }

    if (g.mode === 'select') {
      e.preventDefault();
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = target instanceof Element ? target.closest('[data-cell-slot]') as HTMLElement | null : null;
      if (cell && cell.dataset.cellDay === g.day.toISOString().split('T')[0] && cell.dataset.cellRoom === g.roomId) {
        setSelectEnd({ day: g.day, slot: Number(cell.dataset.cellSlot), roomId: g.roomId });
      }
    } else if (g.mode === 'swipe') {
      e.preventDefault();
    }
  };

  const handleGridTouchEnd = () => {
    const g = touchGestureRef.current;
    touchGestureRef.current = null;
    if (!g) return;

    if (g.mode === 'select') {
      handleMouseUp();
    } else if (g.mode === 'swipe') {
      if (g.lastDx < 0) onSwipeNext();
      else if (g.lastDx > 0) onSwipePrev();
    } else if (g.mode === 'pending' && g.canSelect) {
      // A tap without any drag — select exactly this one slot.
      finishSelection(g, g.slot);
    }
  };

  // --- Render Helpers ---

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(<div key={`pad-${i}`} className="h-16 md:h-24 bg-gray-50 border border-gray-100" />);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = dateObj.toISOString().split('T')[0];
      const dayBookings = displayedBookings.filter(b => b.startTime.startsWith(dateStr));

      const todayZero = new Date();
      todayZero.setHours(0,0,0,0);
      const isPast = dateObj < todayZero;

      days.push(
        <div key={d} className={`h-16 md:h-24 border border-gray-100 p-1 relative overflow-hidden transition-colors
             ${isPast ? 'bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_10px,#e5e7eb_10px,#e5e7eb_20px)] opacity-70' : 'hover:bg-blue-50 cursor-pointer'}`}
             onClick={() => {
               if (!isPast) onSelectSlot({ date: dateStr });
             }}
        >
          <span className={`text-xs md:text-sm font-semibold ${d === new Date().getDate() && month === new Date().getMonth() ? 'bg-blue-600 text-white rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center' : 'text-slate-700'}`}>{d}</span>
          <div className="mt-1 space-y-1 overflow-y-auto max-h-10 md:max-h-16 no-scrollbar">
            {dayBookings.map(b => (
              <div key={b.id}
                   onClick={(e) => {
                       e.stopPropagation();
                       if (!isPast) onOpenBooking(b);
                   }}
                   onMouseEnter={(e) => handleBookingMouseEnter(e, b)}
                   onMouseMove={handleBookingMouseMove}
                   onMouseLeave={handleBookingMouseLeave}
                   className={`text-[10px] md:text-xs rounded px-1 truncate border cursor-pointer
                     ${b.status === 'PENDING_APPROVAL'
                        ? 'bg-yellow-50 text-yellow-700 border-yellow-200 border-dashed'
                        : 'bg-blue-100 text-blue-800 border-blue-200'}`}
                >
                {filterRoomId === 'ALL' && <span className="font-bold mr-1">[{rooms.find(r => r.id === b.roomId)?.name.substring(0,2)}]</span>}
                {b.title}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200">
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} className="bg-white p-2 text-center font-semibold text-slate-500 text-sm">{day}</div>
        ))}
        {days.map((d, i) => <div key={i} className="bg-white">{d}</div>)}
      </div>
    );
  };

  const renderWeekView = () => {
    const singleDay = isSingleDayMode();

    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const weekDays = singleDay
      ? [currentDate]
      : Array.from({length: 7}, (_, i) => {
          const d = new Date(startOfWeek);
          d.setDate(startOfWeek.getDate() + i);
          return d;
        });

    const timeSlots = Array.from({length: SLOTS_PER_DAY}, (_, i) => i);

    // Per-Room columns: when the calendar's Room filter is ALL, each Room
    // gets its own column so a Booking in one Room's column can never block
    // drag-select in another Room's column at the same day/time. Filtering
    // to a specific Room keeps the single-column layout as before.
    const visibleRooms = filterRoomId === 'ALL' ? rooms : rooms.filter(r => r.id === filterRoomId);

    // No Room to show a column for (Rooms still loading, fetch failed, or
    // none configured yet) — bail out before the grid, rather than reserving
    // column width for Rooms that don't render any cells.
    if (visibleRooms.length === 0) {
      return (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2 border border-gray-200 rounded-lg">
          <Monitor size={40} className="text-slate-200" />
          <p>{rooms.length === 0 ? '尚無會議室，請先請管理員新增會議室' : '找不到符合篩選條件的會議室'}</p>
        </div>
      );
    }

    const columnsPerDay = visibleRooms.length;
    const showRoomSubHeader = columnsPerDay > 1;

    const timeGutterWidth = 88;
    const perColumnWidth = columnsPerDay > 1 ? 96 : 130;
    const gridMinWidth = timeGutterWidth + weekDays.length * columnsPerDay * perColumnWidth;
    const gridTemplateColumns = `${timeGutterWidth}px repeat(${weekDays.length * columnsPerDay}, minmax(${perColumnWidth}px, 1fr))`;

    // Each time-slot row gets an equal 1fr share of the available height,
    // but never below SLOT_MIN_HEIGHT — on a normal screen that means the
    // whole day fits with no scroll, but once real bookings (stacked
    // back-to-back) need more room than the fractional share gives them,
    // rows stop shrinking and the container scrolls instead of clipping
    // booking text. Horizontal scroll is separate (still needed when there
    // are many day/room columns).
    const SLOT_MIN_HEIGHT = 32;
    const headerRowTemplate = showRoomSubHeader ? 'auto auto' : 'auto';
    const gridTemplateRows = `${headerRowTemplate} repeat(${SLOTS_PER_DAY}, minmax(${SLOT_MIN_HEIGHT}px, 1fr))`;

    return (
      <div
        className="overflow-auto border border-gray-200 rounded-lg select-none h-[calc(100vh-320px)] min-h-[320px]"
        onMouseLeave={() => setIsSelecting(false)}
        onTouchMove={handleGridTouchMove}
        onTouchEnd={handleGridTouchEnd}
      >
        <div className="grid min-h-full" style={{ gridTemplateColumns, gridTemplateRows, minWidth: gridMinWidth }}>
           <div
             className="bg-gray-50 p-2 sm:p-4 border-b border-r text-xs font-bold text-slate-400 text-center uppercase sticky top-0 left-0 z-40"
             style={{ gridRow: showRoomSubHeader ? 'span 2' : 'span 1' }}
           >
             時間
           </div>
           {weekDays.map((d, i) => (
             <div
               key={i}
               ref={i === 0 ? dayHeaderRef : undefined}
               style={{ gridColumn: `span ${columnsPerDay}` }}
               className={`bg-gray-50 p-2 sm:p-4 border-b text-center border-r last:border-r-0 sticky top-0 z-30 ${d.toDateString() === new Date().toDateString() ? 'bg-blue-50' : ''}`}
             >
               <div className="font-bold text-slate-700">{['週日', '週一', '週二', '週三', '週四', '週五', '週六'][d.getDay()]}</div>
               <div className={`text-sm ${d.toDateString() === new Date().toDateString() ? 'text-blue-600' : 'text-slate-500'}`}>{d.getDate()}</div>
             </div>
           ))}

           {showRoomSubHeader && weekDays.map((d, i) => (
             <React.Fragment key={`sub-${i}`}>
               {visibleRooms.map(room => (
                 <div
                   key={room.id}
                   style={{ top: dayHeaderHeight }}
                   className="bg-gray-50 p-1 border-b border-r last:border-r-0 text-center sticky z-30"
                 >
                   <div className="text-[10px] font-semibold text-slate-500 truncate" title={room.name}>{room.name}</div>
                 </div>
               ))}
             </React.Fragment>
           ))}

           {timeSlots.map(slot => (
             <React.Fragment key={slot}>
               <div className={`border-r border-b p-1 text-center bg-white sticky left-0 z-10 h-full flex items-center justify-center overflow-hidden ${slot % 2 === 0 ? 'text-sm font-bold text-slate-700' : 'text-xs text-slate-400'}`}>
                 {formatSlotTime(slot)}
               </div>

               {weekDays.map((day, i) => {
                 const dayStr = day.toISOString().split('T')[0];
                 const thisSlotStart = slotDate(day, slot);
                 const thisSlotEnd = new Date(thisSlotStart.getTime() + 30 * 60000);
                 const isPast = thisSlotStart < now;

                 // Current Time Line Calculation
                 const isToday = day.toDateString() === now.toDateString();
                 const isCurrentSlot = now >= thisSlotStart && now < thisSlotEnd;
                 const minutePct = ((now.getMinutes() % 30) / 30) * 100;

                 return visibleRooms.map(room => {
                   const slotBookings = displayedBookings.filter(b => {
                      const bStart = new Date(b.startTime);
                      const bEnd = new Date(b.endTime);
                      const bDate = bStart.toISOString().split('T')[0];
                      return bDate === dayStr && b.roomId === room.id && bStart < thisSlotEnd && bEnd > thisSlotStart;
                   });

                   let isSelected = false;
                   if (isSelecting && selectStart && selectEnd) {
                      if (day.toDateString() === selectStart.day.toDateString() && room.id === selectStart.roomId) {
                          const minSlot = Math.min(selectStart.slot, selectEnd.slot);
                          const maxSlot = Math.max(selectStart.slot, selectEnd.slot);
                          if (slot >= minSlot && slot <= maxSlot) {
                              isSelected = true;
                          }
                      }
                   }

                   return (
                     <div
                        key={`${dayStr}-${slot}-${room.id}`}
                        data-cell-day={dayStr}
                        data-cell-slot={slot}
                        data-cell-room={room.id}
                        className={`border-r border-b p-1 relative h-full transition-colors
                          ${isPast ? 'bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_10px,#e5e7eb_10px,#e5e7eb_20px)] cursor-not-allowed' : (isSelected ? 'bg-blue-200/50' : 'bg-white hover:bg-gray-50')}`}

                        onMouseDown={() => handleMouseDown({ day, slot, roomId: room.id })}
                        onMouseEnter={() => handleMouseEnter({ day, slot, roomId: room.id })}
                        onMouseUp={handleMouseUp}
                        onTouchStart={(e) => handleCellTouchStart(e, { day, slot, roomId: room.id })}
                     >
                        {/* RED TIME LINE */}
                        {isToday && isCurrentSlot && (
                          <div
                              className="absolute left-0 w-full border-t-2 border-red-500 z-[25] pointer-events-none"
                              style={{ top: `${minutePct}%` }}
                          >
                               <div className="absolute -left-1 -top-1.5 w-2 h-2 bg-red-500 rounded-full"></div>
                          </div>
                        )}

                        {isSelected && (
                           <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center text-xs text-blue-600 font-bold">
                             {selectStart?.slot === slot && "開始"}
                             {selectEnd?.slot === slot && "結束"}
                           </div>
                        )}

                        {slotBookings.map(b => {
                          const canEdit = currentUser && (b.userId === currentUser.id || currentUser.role === UserRole.ADMIN);
                          const isPending = b.status === 'PENDING_APPROVAL';
                          return (
                              <div key={b.id}
                                  onMouseEnter={(e) => handleBookingMouseEnter(e, b)}
                                  onMouseMove={handleBookingMouseMove}
                                  onMouseLeave={handleBookingMouseLeave}
                                  className={`absolute inset-1 z-20 border rounded p-1 text-xs overflow-hidden shadow-sm transition-all group
                                      ${isPast
                                          ? 'bg-gray-200 text-gray-500 border-gray-300'
                                          : (isPending
                                              ? 'bg-yellow-50 text-yellow-800 border-yellow-300 border-dashed hover:bg-yellow-100'
                                              : 'bg-indigo-100 text-indigo-900 border-indigo-200 hover:bg-indigo-200 cursor-pointer hover:shadow-md')
                                      }
                                  `}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onTouchStart={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isPast && canEdit) onOpenBooking(b);
                                  }}
                              >
                              <div className="font-bold truncate flex items-center gap-1">
                                  {isPending && <Clock size={10} className="text-yellow-600 shrink-0"/>}
                                  {!showRoomSubHeader && (
                                    <span className="shrink-0 font-normal opacity-70">[{rooms.find(r => r.id === b.roomId)?.name}]</span>
                                  )}
                                  <span className="truncate">{b.title}</span>
                              </div>
                              </div>
                          );
                        })}
                     </div>
                   );
                 });
               })}
             </React.Fragment>
           ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm select-none">
        {view === 'MONTH' && renderMonthView()}
        {(view === 'WEEK' || view === 'DAY') && renderWeekView()}
      </div>

      {/* Booking Tooltip */}
      {hoveredBooking && (
        <div
           className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-4 w-72 animate-fade-in pointer-events-none"
           style={{ top: Math.min(window.innerHeight - 200, tooltipPosition.y), left: Math.min(window.innerWidth - 300, tooltipPosition.x) }}
        >
           <div className="flex items-start justify-between mb-2">
              <h4 className="font-bold text-slate-800 text-lg leading-tight">{hoveredBooking.title}</h4>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${hoveredBooking.status === 'PENDING_APPROVAL' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                 {hoveredBooking.status === 'PENDING_APPROVAL' ? '審核中' : '已預約'}
              </span>
           </div>
           <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                 <Monitor size={14} className="text-slate-400"/>
                 <span>{rooms.find(r => r.id === hoveredBooking.roomId)?.name}</span>
              </div>
              <div className="flex items-center gap-2">
                 <Clock size={14} className="text-slate-400"/>
                 <span className="font-mono">
                    {new Date(hoveredBooking.startTime).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false})} - {new Date(hoveredBooking.endTime).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false})}
                 </span>
              </div>
              <div className="flex items-center gap-2">
                 <Users size={14} className="text-slate-400"/>
                 <span>{hoveredBooking.userName}</span>
              </div>
              {hoveredBooking.description && (
                 <div className="mt-3 pt-2 border-t border-gray-100">
                    <p className="text-xs text-slate-500 mb-1 font-semibold flex items-center gap-1"><AlignLeft size={12}/> 會議內容</p>
                    <p className="text-slate-700 bg-slate-50 p-2 rounded text-xs leading-relaxed">
                        {hoveredBooking.description}
                    </p>
                 </div>
              )}
           </div>
        </div>
      )}
    </>
  );
};

export { formatSlotTime, slotDate, SLOTS_PER_DAY };
export type { SlotRef };
