
import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../App';
import { CalendarViewType, Booking, UserRole } from '../types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { BookingConflictError } from '../services/bookings';
import { ChevronLeft, ChevronRight, Plus, X, Users, Filter, Clock, Calendar as CalendarIcon, List, Trash2, XCircle, Eye, Monitor, MapPin, CheckCircle2, AlertCircle, AlignLeft } from 'lucide-react';

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

export const Bookings: React.FC = () => {
  const { rooms, bookings, addBooking, cancelBooking, deleteBooking, currentUser } = useData();
  const { success, error, warning, info } = useToast();
  const [activeTab, setActiveTab] = useState<'CALENDAR' | 'HISTORY'>('CALENDAR');
  const [view, setView] = useState<CalendarViewType>('WEEK');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  
  // Current Time Line State
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Filter State
  const [filterRoomId, setFilterRoomId] = useState<string>('ALL');

  // Drag Selection (Create) State
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectStart, setSelectStart] = useState<{day: Date, slot: number} | null>(null);
  const [selectEnd, setSelectEnd] = useState<{day: Date, slot: number} | null>(null);

  // Booking Form State
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState(rooms[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(''); 
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  // Tooltip State
  const [hoveredBooking, setHoveredBooking] = useState<Booking | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // All Bookings that still hold their Slot (CONFIRMED or PENDING_APPROVAL),
  // regardless of the calendar's room filter — this is the authority for any
  // Slot Conflict check, as opposed to displayedBookings below which is only
  // for what the calendar grid renders.
  const activeBookings = useMemo(
    () => bookings.filter(b => b.status === 'CONFIRMED' || b.status === 'PENDING_APPROVAL'),
    [bookings]
  );

  // Filtered Bookings for Calendar rendering (Exclude Rejected)
  const displayedBookings = useMemo(() => {
    const active = bookings.filter(b => b.status !== 'REJECTED');
    if (filterRoomId === 'ALL') return active;
    return active.filter(b => b.roomId === filterRoomId);
  }, [bookings, filterRoomId]);

  // My History Bookings
  const myBookings = useMemo(() => {
    if (!currentUser) return [];
    return bookings
      .filter(b => b.userId === currentUser.id)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [bookings, currentUser]);

  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (view === 'MONTH') newDate.setMonth(newDate.getMonth() - 1);
    else if (view === 'WEEK') newDate.setDate(newDate.getDate() - 7);
    else newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'MONTH') newDate.setMonth(newDate.getMonth() + 1);
    else if (view === 'WEEK') newDate.setDate(newDate.getDate() + 7);
    else newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => setCurrentDate(new Date());

  // --- Tooltip Handlers ---
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
    const x = e.clientX + 15;
    const y = e.clientY + 15;
    setTooltipPosition({ x, y });
  };

  // --- Modal Helpers ---

  const resetForm = () => {
    setEditingBookingId(null);
    setTitle('');
    setDescription('');
    setDate(new Date().toISOString().split('T')[0]);
    setStartTime('09:00');
    setEndTime('10:00');
    if (filterRoomId !== 'ALL') setSelectedRoom(filterRoomId);
    else setSelectedRoom(rooms[0]?.id || '');
  };

  const openCreateModal = (defaultDate?: string, startTimeStr?: string, endTimeStr?: string) => {
    resetForm();
    if (defaultDate) setDate(defaultDate);
    if (startTimeStr) setStartTime(startTimeStr);
    if (endTimeStr) setEndTime(endTimeStr);
    setShowModal(true);
  };

  // Opens the read-only detail view for an existing Booking (only the room/
  // time can be set at creation — there is no reschedule/edit endpoint yet).
  const openEditModal = (booking: Booking) => {
    if (!currentUser) return;
    // Permissions check: only the owner or an Admin can view/cancel
    if (booking.userId !== currentUser.id && currentUser.role !== UserRole.ADMIN) return;

    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);

    setEditingBookingId(booking.id);
    setSelectedRoom(booking.roomId);
    setTitle(booking.title);
    setDescription(booking.description || '');
    setDate(start.toISOString().split('T')[0]);
    setStartTime(start.toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false}));
    setEndTime(end.toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false}));
    setShowModal(true);
  };

  // --- Form Logic ---

  const setDuration = (minutes: number) => {
    const [h, m] = startTime.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + minutes * 60000);
    setEndTime(end.toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false}));
  };

  // Check availability for a specific room given the current form time
  const checkRoomAvailability = (roomId: string): boolean => {
    const formStart = new Date(`${date}T${startTime}`);
    const formEnd = new Date(`${date}T${endTime}`);

    // Invalid time range
    if (formStart >= formEnd) return false;

    return !activeBookings.some(b => {
      // Skip self if editing
      if (editingBookingId && b.id === editingBookingId) return false;
      if (b.roomId !== roomId) return false;

      const bStart = new Date(b.startTime);
      const bEnd = new Date(b.endTime);

      // Overlap logic: (StartA < EndB) and (EndA > StartB)
      return formStart < bEnd && formEnd > bStart;
    });
  };

  // --- Drag Selection (Create) Logic ---

  const handleMouseDown = (day: Date, slot: number) => {
    if (!currentUser || currentUser.role === UserRole.GUEST) return;

    // Strictly Prevent selecting past time
    const currentTime = new Date();
    if (slotDate(day, slot) < currentTime) return;

    setIsSelecting(true);
    setSelectStart({ day, slot });
    setSelectEnd({ day, slot });
  };

  const handleMouseEnter = (day: Date, slot: number) => {
    if (isSelecting && selectStart) {
      // Only allow dragging within the same day for simplicity
      if (day.toDateString() === selectStart.day.toDateString()) {
        setSelectEnd({ day, slot });
      }
    }
  };

  const handleMouseUp = () => {
    if (isSelecting && selectStart && selectEnd) {
      setIsSelecting(false);

      // Calculate start and end times (30-minute slots)
      const minSlot = Math.min(selectStart.slot, selectEnd.slot);
      const maxSlot = Math.max(selectStart.slot, selectEnd.slot);

      const dateStr = selectStart.day.toISOString().split('T')[0];
      openCreateModal(dateStr, formatSlotTime(minSlot), formatSlotTime(maxSlot + 1));
    }
    setSelectStart(null);
    setSelectEnd(null);
  };

  // --- Form Submission ---

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || editingBookingId) return;

    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);

    if (start >= end) {
        error("結束時間必須晚於開始時間");
        return;
    }

    // Client-side pre-check for immediate feedback; the server's Slot
    // Conflict check is the real authority (see services/bookings.ts).
    if (!checkRoomAvailability(selectedRoom)) {
        error("所選時段該會議室已被預約，請更換時間或會議室。");
        return;
    }

    const room = rooms.find(r => r.id === selectedRoom);

    setSubmitting(true);
    try {
        await addBooking({
            roomId: selectedRoom,
            title,
            description,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
        });
        if (room?.requiresApproval) {
          warning("預約已送出！該會議室需經管理員審核。");
        } else {
          success("會議室預約成功！");
        }
        setShowModal(false);
        resetForm();
    } catch (err) {
        if (err instanceof BookingConflictError) {
          error("所選時段該會議室已被預約，請更換時間或會議室。");
        } else {
          error("預約失敗,請稍後再試");
        }
    } finally {
        setSubmitting(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!editingBookingId) return;
    if (!window.confirm("確定要刪除此預約？此動作無法復原。")) return;
    try {
        await deleteBooking(editingBookingId);
        success("預約已刪除");
        setShowModal(false);
        resetForm();
    } catch {
        error("刪除失敗,請稍後再試");
    }
  }

  // --- Render Helpers ---

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days = [];
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(<div key={`pad-${i}`} className="h-24 bg-gray-50 border border-gray-100" />);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      const dateStr = dateObj.toISOString().split('T')[0];
      const dayBookings = displayedBookings.filter(b => b.startTime.startsWith(dateStr));
      
      const todayZero = new Date();
      todayZero.setHours(0,0,0,0);
      const isPast = dateObj < todayZero;

      days.push(
        <div key={d} className={`h-24 border border-gray-100 p-1 relative overflow-hidden transition-colors 
             ${isPast ? 'bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_10px,#e5e7eb_10px,#e5e7eb_20px)] opacity-70' : 'hover:bg-blue-50 cursor-pointer'}`}
             onClick={() => {
               if (!isPast) openCreateModal(dateStr);
             }}
        >
          <span className={`text-sm font-semibold ${d === new Date().getDate() && month === new Date().getMonth() ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center' : 'text-slate-700'}`}>{d}</span>
          <div className="mt-1 space-y-1 overflow-y-auto max-h-16 no-scrollbar">
            {dayBookings.map(b => (
              <div key={b.id} 
                   onClick={(e) => {
                       e.stopPropagation();
                       if (!isPast) openEditModal(b);
                   }}
                   onMouseEnter={(e) => handleBookingMouseEnter(e, b)}
                   onMouseMove={handleBookingMouseMove}
                   onMouseLeave={handleBookingMouseLeave}
                   className={`text-xs rounded px-1 truncate border cursor-pointer 
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
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay()); 

    const weekDays = Array.from({length: view === 'WEEK' ? 7 : 1}, (_, i) => {
        const d = new Date(view === 'WEEK' ? startOfWeek : currentDate);
        if (view === 'WEEK') d.setDate(startOfWeek.getDate() + i);
        return d;
    });

    const timeSlots = Array.from({length: SLOTS_PER_DAY}, (_, i) => i);

    return (
      <div className="overflow-x-auto border border-gray-200 rounded-lg select-none" onMouseLeave={() => setIsSelecting(false)}>
        <div className={`grid ${view === 'WEEK' ? 'grid-cols-8' : 'grid-cols-2'} min-w-[800px]`}>
           <div className="bg-gray-50 p-4 border-b border-r text-xs font-bold text-slate-400 text-center uppercase sticky left-0 z-10">時間</div>
           {weekDays.map((d, i) => (
             <div key={i} className={`bg-gray-50 p-4 border-b text-center border-r last:border-r-0 ${d.toDateString() === new Date().toDateString() ? 'bg-blue-50' : ''}`}>
               <div className="font-bold text-slate-700">{['週日', '週一', '週二', '週三', '週四', '週五', '週六'][d.getDay()]}</div>
               <div className={`text-sm ${d.toDateString() === new Date().toDateString() ? 'text-blue-600' : 'text-slate-500'}`}>{d.getDate()}</div>
             </div>
           ))}

           {timeSlots.map(slot => (
             <React.Fragment key={slot}>
               <div className="border-r border-b p-2 text-xs text-slate-400 text-center bg-white sticky left-0 z-10 h-8 flex items-center justify-center">
                 {slot % 2 === 0 ? formatSlotTime(slot) : ''}
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

                 const slotBookings = displayedBookings.filter(b => {
                    const bStart = new Date(b.startTime);
                    const bEnd = new Date(b.endTime);
                    const bDate = bStart.toISOString().split('T')[0];
                    return bDate === dayStr && bStart < thisSlotEnd && bEnd > thisSlotStart;
                 });

                 let isSelected = false;
                 if (isSelecting && selectStart && selectEnd) {
                    if (day.toDateString() === selectStart.day.toDateString()) {
                        const minSlot = Math.min(selectStart.slot, selectEnd.slot);
                        const maxSlot = Math.max(selectStart.slot, selectEnd.slot);
                        if (slot >= minSlot && slot <= maxSlot) {
                            isSelected = true;
                        }
                    }
                 }

                 return (
                   <div
                      key={`${dayStr}-${slot}`}
                      className={`border-r border-b p-1 relative h-8 transition-colors
                        ${isPast ? 'bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_10px,#e5e7eb_10px,#e5e7eb_20px)] cursor-not-allowed' : (isSelected ? 'bg-blue-200/50' : 'bg-white hover:bg-gray-50')}`}

                      onMouseDown={() => handleMouseDown(day, slot)}
                      onMouseEnter={() => handleMouseEnter(day, slot)}
                      onMouseUp={handleMouseUp}
                   >
                      {/* RED TIME LINE */}
                      {isToday && isCurrentSlot && (
                        <div
                            className="absolute left-0 w-full border-t-2 border-red-500 z-30 pointer-events-none"
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isPast && canEdit) openEditModal(b);
                                }}
                            >
                            <div className="font-bold truncate flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  {isPending && <Clock size={10} className="text-yellow-600"/>}
                                  {b.title}
                                </span>
                            </div>
                            <div className="truncate text-[10px] opacity-80">{rooms.find(r => r.id === b.roomId)?.name}</div>
                            </div>
                        );
                      })}
                   </div>
                 );
               })}
             </React.Fragment>
           ))}
        </div>
      </div>
    );
  };

  const viewLabels = { 'MONTH': '月', 'WEEK': '週', 'DAY': '日' };

  // Mirrors the History tab's canDelete rule (startTime still in the future).
  const canDeleteEditingBooking = !!editingBookingId && new Date(`${date}T${startTime}`) > new Date();

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-800">會議室預約狀況</h1>
        
        {currentUser && (currentUser.role !== UserRole.GUEST) && (
            <Button onClick={() => openCreateModal()}>
              <Plus size={18} /> 新增預約
            </Button>
        )}
      </div>

      <div className="flex border-b border-gray-200 gap-6">
        <button
          onClick={() => setActiveTab('CALENDAR')}
          className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'CALENDAR' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarIcon size={18}/> 預約行事曆
        </button>
        
        {currentUser && currentUser.role !== UserRole.GUEST && (
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'HISTORY' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <List size={18}/> 我的預約紀錄
          </button>
        )}
      </div>

      {activeTab === 'CALENDAR' && (
        <div className="space-y-4 animate-fade-in">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center bg-white border rounded-lg px-3 py-1.5 shadow-sm">
                        <Filter size={16} className="text-slate-400 mr-2" />
                        <select 
                            value={filterRoomId} 
                            onChange={(e) => setFilterRoomId(e.target.value)}
                            className="bg-transparent text-sm text-slate-700 outline-none border-none cursor-pointer min-w-[120px]"
                        >
                        <option value="ALL">所有會議室</option>
                        {rooms.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                        </select>
                    </div>

                    <div className="flex bg-white rounded-lg border p-1 shadow-sm">
                        {(['MONTH', 'WEEK', 'DAY'] as CalendarViewType[]).map((v) => (
                        <button
                            key={v}
                            onClick={() => setView(v)}
                            className={`px-3 py-1.5 text-sm font-medium rounded ${view === v ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-gray-50'}`}
                        >
                            {viewLabels[v]}
                        </button>
                        ))}
                    </div>
                </div>
                
                <div className="flex items-center justify-between bg-white p-2 rounded-lg border shadow-sm gap-2">
                    <button 
                        onClick={handlePrev} 
                        className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="上一頁"
                    >
                        <ChevronLeft size={18}/>
                    </button>
                    <span className="text-sm font-semibold text-slate-700 min-w-[140px] text-center select-none">
                        {currentDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', ...(view === 'DAY' ? {day: 'numeric'} : {}) })}
                    </span>
                    <button 
                        onClick={handleNext} 
                        className="w-8 h-8 flex items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="下一頁"
                    >
                        <ChevronRight size={18}/>
                    </button>
                    <Button variant="ghost" size="sm" onClick={handleToday} className="text-xs h-8">今天</Button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm select-none">
                {view === 'MONTH' && renderMonthView()}
                {(view === 'WEEK' || view === 'DAY') && renderWeekView()}
            </div>
            
            <div className="flex gap-4 text-sm text-slate-500 items-center justify-end flex-wrap">
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-100 border border-indigo-200 rounded"></div> 已預約</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-50 border border-yellow-300 border-dashed rounded"></div> 待審核</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_5px,#e5e7eb_5px,#e5e7eb_10px)] border border-gray-200 rounded"></div> 過去時間</div>
            </div>
        </div>
      )}

      {activeTab === 'HISTORY' && currentUser && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden animate-fade-in">
            {myBookings.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="p-4">會議主題</th>
                    <th className="p-4">會議室</th>
                    <th className="p-4">日期</th>
                    <th className="p-4">時間</th>
                    <th className="p-4">狀態</th>
                    <th className="p-4">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {myBookings.map(booking => {
                      const isFuture = new Date(booking.endTime) > new Date();
                      const canDelete = new Date(booking.startTime) > new Date();
                      const canCancel = isFuture && (booking.status === 'CONFIRMED' || booking.status === 'PENDING_APPROVAL');
                      const statusMap = {
                          'CONFIRMED': { label: '已確認', color: 'bg-green-100 text-green-800' },
                          'PENDING_APPROVAL': { label: '待審核', color: 'bg-yellow-100 text-yellow-800' },
                          'REJECTED': { label: '已拒絕', color: 'bg-red-100 text-red-800' },
                          'CANCELLED': { label: '已取消', color: 'bg-gray-100 text-gray-800' }
                      };
                      const statusInfo = statusMap[booking.status] || { label: booking.status, color: 'bg-gray-100' };

                      return (
                        <tr key={booking.id} className="hover:bg-gray-50 text-sm">
                        <td className="p-4 font-medium text-slate-800">
                            {booking.title}
                            {booking.description && <div className="text-xs text-slate-400 truncate max-w-[200px]">{booking.description}</div>}
                        </td>
                        <td className="p-4 text-slate-600">{rooms.find(r => r.id === booking.roomId)?.name || '未知會議室'}</td>
                        <td className="p-4 text-slate-600">{new Date(booking.startTime).toLocaleDateString('zh-TW')}</td>
                        <td className="p-4 text-slate-600 font-mono">
                            {new Date(booking.startTime).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false})} - 
                            {new Date(booking.endTime).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false})}
                        </td>
                        <td className="p-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}>
                                {statusInfo.label}
                            </span>
                        </td>
                        <td className="p-4">
                            {(isFuture && booking.status !== 'REJECTED') || canDelete ? (
                                <div className="flex gap-2">
                                    {isFuture && booking.status !== 'REJECTED' && (
                                        <button onClick={() => openEditModal(booking)} className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded" title="查看詳情">
                                            <Eye size={16}/>
                                        </button>
                                    )}
                                    {canCancel && (
                                        <button
                                            onClick={async () => {
                                                if(window.confirm("確定要取消此預約？")) {
                                                    try {
                                                        await cancelBooking(booking.id);
                                                        success("預約已取消");
                                                    } catch {
                                                        error("取消失敗,請稍後再試");
                                                    }
                                                }
                                            }}
                                            className="text-orange-400 hover:text-orange-600 hover:bg-orange-50 p-1 rounded"
                                            title="取消預約"
                                        >
                                            <XCircle size={16}/>
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button
                                            onClick={async () => {
                                                if(window.confirm("確定要刪除此預約？此動作無法復原。")) {
                                                    try {
                                                        await deleteBooking(booking.id);
                                                        success("預約已刪除");
                                                    } catch {
                                                        error("刪除失敗,請稍後再試");
                                                    }
                                                }
                                            }}
                                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded"
                                            title="刪除預約"
                                        >
                                            <Trash2 size={16}/>
                                        </button>
                                    )}
                                </div>
                            ) : null}
                        </td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
                <Clock size={48} className="text-slate-200"/>
                <p>尚無預約紀錄</p>
                <Button variant="outline" onClick={() => setActiveTab('CALENDAR')}>前往行事曆預約</Button>
              </div>
            )}
        </div>
      )}

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

      {/* Enhanced Booking Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-8 py-5 border-b bg-slate-50 flex justify-between items-center">
              <div>
                 <h3 className="font-bold text-xl text-slate-800">{editingBookingId ? '預約詳情' : '預約會議室'}</h3>
                 <p className="text-sm text-slate-500 mt-1">{editingBookingId ? '此預約無法修改時間或會議室,如需變更請取消後重新預約' : '請設定時間並選擇可用的會議室'}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full p-1 transition-colors"><X/></button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                {/* Left: Form Inputs */}
                <div className="w-full md:w-1/3 p-6 border-r border-gray-100 bg-white overflow-y-auto">
                    <form id="booking-form" onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">會議主題 *</label>
                            <input required disabled={!!editingBookingId} type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-500" placeholder="例如：Q4 策略會議" />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">會議內容 (選填)</label>
                            <textarea
                                rows={3}
                                disabled={!!editingBookingId}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:bg-slate-50 disabled:text-slate-500"
                                placeholder="簡述會議目的或議程..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">日期</label>
                            <input required disabled={!!editingBookingId} type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                        </div>

                        <div className="space-y-2">
                             <label className="block text-sm font-bold text-slate-700">時間區間</label>
                             <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">開始</span>
                                    <input required disabled={!!editingBookingId} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                                </div>
                                <div className="space-y-1">
                                    <span className="text-xs text-slate-500">結束</span>
                                    <input required disabled={!!editingBookingId} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                                </div>
                             </div>

                             {!editingBookingId && (
                               <div className="flex gap-2 pt-2">
                                   <button type="button" onClick={() => setDuration(30)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors">+30分</button>
                                   <button type="button" onClick={() => setDuration(60)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors">+1小時</button>
                                   <button type="button" onClick={() => setDuration(90)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors">+1.5小時</button>
                               </div>
                             )}
                        </div>
                    </form>
                </div>

                {/* Right: Room Selection */}
                <div className="flex-1 bg-slate-50/50 p-6 overflow-y-auto">
                    <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Monitor size={16}/> 選擇會議室
                        <span className="text-xs font-normal text-slate-500 ml-auto">系統已自動過濾衝突時段</span>
                    </h4>
                    
                    <div className="grid grid-cols-1 gap-4">
                        {rooms.map(room => {
                            const isAvailable = checkRoomAvailability(room.id);
                            const isSelected = selectedRoom === room.id;
                            
                            return (
                                <div
                                    key={room.id}
                                    onClick={() => !editingBookingId && isAvailable && setSelectedRoom(room.id)}
                                    className={`
                                        relative flex items-center gap-4 p-3 rounded-xl border-2 transition-all cursor-pointer
                                        ${isSelected 
                                            ? 'border-blue-500 bg-blue-50 shadow-md' 
                                            : (isAvailable ? 'border-white bg-white hover:border-blue-200 hover:shadow-sm' : 'border-gray-100 bg-gray-100 opacity-60 cursor-not-allowed grayscale')
                                        }
                                    `}
                                >
                                    <div className="w-24 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                                        {room.imageUrl ? (
                                            <img src={room.imageUrl} alt={room.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <Monitor size={24} />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <h5 className="font-bold text-slate-800 truncate">{room.name}</h5>
                                            {isAvailable ? (
                                                <div className="flex gap-2">
                                                    {room.requiresApproval && <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">需審核</span>}
                                                    <span className="text-xs font-bold text-green-600 flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full">
                                                        <CheckCircle2 size={10}/> 空閒
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xs font-bold text-red-500 flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-full">
                                                    <AlertCircle size={10}/> 已佔用
                                                </span>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            <span className="flex items-center gap-1"><Users size={12}/> {room.capacity !== null ? `${room.capacity}人` : '人數未設定'}</span>
                                            <span className="flex items-center gap-1"><MapPin size={12}/> {room.location}</span>
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {room.equipment.slice(0, 3).map((eq, i) => (
                                                <span key={i} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200">
                                                    {eq}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {isSelected && (
                                        <div className="absolute -top-2 -right-2 bg-blue-500 text-white p-1 rounded-full shadow-sm">
                                            <CheckCircle2 size={16} fill="white" className="text-blue-500"/>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Modal Footer */}
            <div className="px-8 py-4 border-t bg-white flex justify-between items-center">
                 <div>
                    {canDeleteEditingBooking && (
                        <Button type="button" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 px-2" onClick={handleDeleteBooking}>
                            <Trash2 size={18} className="mr-2"/> 刪除此預約
                        </Button>
                    )}
                 </div>
                 <div className="flex gap-3">
                    <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>關閉</Button>
                    {!editingBookingId && (
                        <Button onClick={handleSubmit} disabled={submitting || !checkRoomAvailability(selectedRoom)} isLoading={submitting}>
                            確認預約
                        </Button>
                    )}
                 </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
