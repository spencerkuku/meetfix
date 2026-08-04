
import React, { useState, useMemo, useEffect } from 'react';
import { useAuthData } from '../state/auth';
import { useRoomsData } from '../state/rooms';
import { useBookingsData } from '../state/bookings';
import { CalendarViewType, Booking, UserRole } from '../types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { isActiveSlot, isDeletable } from './booking-eligibility';
import { BookingCalendarGrid, CalendarSelection } from './BookingCalendarGrid';
import { BookingFormModal, BookingFormTarget } from './BookingFormModal';
import { ChevronLeft, ChevronRight, Plus, Filter, Clock, Calendar as CalendarIcon, List, Trash2, Eye } from 'lucide-react';

export const Bookings: React.FC = () => {
  const { currentUser } = useAuthData();
  const { rooms } = useRoomsData();
  const { bookings, addBooking, updateBooking, deleteBooking } = useBookingsData();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'CALENDAR' | 'HISTORY'>('CALENDAR');
  const [view, setView] = useState<CalendarViewType>('WEEK');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Filter State
  const [filterRoomId, setFilterRoomId] = useState<string>('ALL');

  // RWD: below this width, WEEK view collapses to a single day (see
  // isSingleDayMode below) and swipe replaces the 7-day grid. Needed both
  // here (nav step size, date-label formatting) and by BookingCalendarGrid
  // (single-column layout, swipe gesture), so it's lifted rather than
  // detected independently in both places.
  const MOBILE_BREAKPOINT = 768;
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isSingleDayMode = () => view === 'DAY' || (view === 'WEEK' && isMobile);

  // Booking form/modal: null when closed, otherwise what it should show —
  // a fresh create form (optionally prefilled from a Slot selection) or an
  // existing Booking to view/edit.
  const [formTarget, setFormTarget] = useState<BookingFormTarget | null>(null);

  // All Bookings that still hold their Slot (CONFIRMED or PENDING_APPROVAL),
  // regardless of the calendar's room filter — this is the authority for any
  // Slot Conflict check, as opposed to displayedBookings below which is only
  // for what the calendar grid renders.
  const activeBookings = useMemo(
    () => bookings.filter(b => isActiveSlot(b.status)),
    [bookings]
  );

  // Filtered Bookings for Calendar rendering — same Slot-holding rule as
  // activeBookings above, further narrowed by the calendar's room filter.
  const displayedBookings = useMemo(() => {
    if (filterRoomId === 'ALL') return activeBookings;
    return activeBookings.filter(b => b.roomId === filterRoomId);
  }, [activeBookings, filterRoomId]);

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
    else if (view === 'WEEK' && !isSingleDayMode()) newDate.setDate(newDate.getDate() - 7);
    else newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'MONTH') newDate.setMonth(newDate.getMonth() + 1);
    else if (view === 'WEEK' && !isSingleDayMode()) newDate.setDate(newDate.getDate() + 7);
    else newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => setCurrentDate(new Date());

  const openCreateModal = (defaultDate?: string, startTimeStr?: string, endTimeStr?: string, roomId?: string) => {
    setFormTarget({
      mode: 'create',
      date: defaultDate,
      startTime: startTimeStr,
      endTime: endTimeStr,
      roomId: roomId ?? (filterRoomId !== 'ALL' ? filterRoomId : undefined),
    });
  };

  const handleSelectSlot = (selection: CalendarSelection) => {
    openCreateModal(selection.date, selection.startTime, selection.endTime, selection.roomId);
  };

  // Opens the Booking Detail view for an existing Booking. Editable in place
  // when the Booking is still eligible (see BookingFormModal) — the owner
  // or an Admin can then change title/description/date/time/Room directly,
  // same as at creation.
  const openEditModal = (booking: Booking) => {
    if (!currentUser) return;
    // Permissions check: only the owner or an Admin can view/edit/delete
    if (booking.userId !== currentUser.id && currentUser.role !== UserRole.ADMIN) return;
    setFormTarget({ mode: 'edit', booking });
  };

  const viewLabels = { 'MONTH': '月', 'WEEK': '週', 'DAY': '日' };

  return (
    <>
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
                        {currentDate.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', ...(isSingleDayMode() ? {day: 'numeric'} : {}) })}
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

            <BookingCalendarGrid
                view={view}
                currentDate={currentDate}
                isMobile={isMobile}
                rooms={rooms}
                bookings={displayedBookings}
                filterRoomId={filterRoomId}
                currentUser={currentUser}
                onSelectSlot={handleSelectSlot}
                onOpenBooking={openEditModal}
                onSwipeNext={handleNext}
                onSwipePrev={handlePrev}
            />

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
                      // Not yet ended — distinct from isDeletable (below):
                      // an in-progress Booking can still be viewed here,
                      // just not deleted.
                      const isFuture = new Date(booking.endTime) > new Date();
                      const canDelete = isDeletable(booking);
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
    </div>

      {formTarget && (
        <BookingFormModal
          target={formTarget}
          rooms={rooms}
          activeBookings={activeBookings}
          addBooking={addBooking}
          updateBooking={updateBooking}
          deleteBooking={deleteBooking}
          onClose={() => setFormTarget(null)}
        />
      )}
    </>
  );
};
