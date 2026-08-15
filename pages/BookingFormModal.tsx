import React, { useEffect, useState } from 'react';
import { Booking, Room } from '../types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { BookingConflictError, CreateBookingInput, UpdateBookingInput } from '../services/bookings';
import { isDeletable, isEditable, rangesOverlap } from './booking-eligibility';
import { X, Trash2, Monitor, Users, MapPin, CheckCircle2, AlertCircle } from 'lucide-react';

// What the modal is asked to do when it opens: create a new Booking
// (optionally prefilled from a Slot selection) or open an existing one.
export type BookingFormTarget =
  | { mode: 'create'; date?: string; startTime?: string; endTime?: string; roomId?: string }
  | { mode: 'edit'; booking: Booking };

export interface BookingFormModalProps {
  target: BookingFormTarget;
  rooms: Room[];
  activeBookings: Booking[];
  addBooking: (input: CreateBookingInput) => Promise<void>;
  updateBooking: (id: string, input: UpdateBookingInput) => Promise<void>;
  deleteBooking: (id: string) => Promise<void>;
  onClose: () => void;
}

// Create/edit/delete a Booking, including the reschedule-vs-approval-reset
// confirmation dialog and the Room-availability picker. `target` decides
// which mode the form opens in; the modal manages its own field state and
// calls back into the data layer it's given (addBooking/updateBooking/
// deleteBooking) exactly as the caller already exposes them.
export const BookingFormModal: React.FC<BookingFormModalProps> = ({
  target,
  rooms,
  activeBookings,
  addBooking,
  updateBooking,
  deleteBooking,
  onClose,
}) => {
  const { success, error, warning } = useToast();

  const editingBooking = target.mode === 'edit' ? target.booking : null;
  const editingBookingId = editingBooking?.id ?? null;

  const [selectedRoom, setSelectedRoom] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [submitting, setSubmitting] = useState(false);

  // Initialize form fields from `target` once, on open — mirrors the
  // resetForm/openCreateModal/openEditModal split the modal used to live
  // inside pages/Bookings.tsx as, just triggered by props instead of calls.
  useEffect(() => {
    if (target.mode === 'edit') {
      const b = target.booking;
      const start = new Date(b.startTime);
      const end = new Date(b.endTime);
      setSelectedRoom(b.roomId);
      setTitle(b.title);
      setDescription(b.description || '');
      setDate(start.toISOString().split('T')[0]);
      setStartTime(start.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }));
      setEndTime(end.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }));
    } else {
      setSelectedRoom(target.roomId ?? rooms[0]?.id ?? '');
      setTitle('');
      setDescription('');
      setDate(target.date ?? new Date().toISOString().split('T')[0]);
      setStartTime(target.startTime ?? '09:00');
      setEndTime(target.endTime ?? '10:00');
    }
    // Only re-run when the identity of what we're editing/creating changes,
    // not on every keystroke into the fields it initializes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.mode, editingBookingId]);

  const setDuration = (minutes: number) => {
    const [h, m] = startTime.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + minutes * 60000);
    setEndTime(end.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }));
  };

  // Check availability for a specific room given the current form time.
  // Client-side pre-check for immediate feedback; the server's Slot
  // Conflict check is the real authority (see services/bookings.ts).
  const checkRoomAvailability = (roomId: string): boolean => {
    const formStart = new Date(`${date}T${startTime}`);
    const formEnd = new Date(`${date}T${endTime}`);

    if (formStart >= formEnd) return false;

    return !activeBookings.some(b => {
      if (editingBookingId && b.id === editingBookingId) return false;
      if (b.roomId !== roomId) return false;

      const bStart = new Date(b.startTime);
      const bEnd = new Date(b.endTime);

      return rangesOverlap({ start: formStart, end: formEnd }, { start: bStart, end: bEnd });
    });
  };

  const canDeleteEditingBooking = !!editingBooking && isDeletable(editingBooking);
  const canEditBooking = !!editingBooking && isEditable(editingBooking);
  const formEditable = !editingBookingId || canEditBooking;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBookingId) return;

    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);

    if (start >= end) {
      error('結束時間必須晚於開始時間');
      return;
    }
    if (!checkRoomAvailability(selectedRoom)) {
      error('所選時段該會議室已被預約，請更換時間或會議室。');
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
        warning('預約已送出！該會議室需經管理員審核。');
      } else {
        success('會議室預約成功！');
      }
      onClose();
    } catch (err) {
      if (err instanceof BookingConflictError) {
        error('所選時段該會議室已被預約，請更換時間或會議室。');
      } else {
        error('預約失敗,請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBookingId || !editingBooking) return;

    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);

    if (start >= end) {
      error('結束時間必須晚於開始時間');
      return;
    }
    if (!checkRoomAvailability(selectedRoom)) {
      error('所選時段該會議室已被預約，請更換時間或會議室。');
      return;
    }

    // Only send roomId/startTime/endTime when they actually changed — this
    // mirrors the backend's own "content-only edits never touch status"
    // rule, so a pure title/description fix never risks re-triggering
    // approval.
    const isRescheduling =
      selectedRoom !== editingBooking.roomId ||
      start.getTime() !== new Date(editingBooking.startTime).getTime() ||
      end.getTime() !== new Date(editingBooking.endTime).getTime();

    if (isRescheduling && editingBooking.status === 'CONFIRMED') {
      const newRoom = rooms.find(r => r.id === selectedRoom);
      if (newRoom?.requiresApproval) {
        const confirmed = window.confirm('此變更會使這筆已核准的預約重新進入待審核狀態，確定要儲存嗎？');
        if (!confirmed) return;
      }
    }

    setSubmitting(true);
    try {
      await updateBooking(editingBookingId, {
        title,
        description,
        ...(isRescheduling
          ? { roomId: selectedRoom, startTime: start.toISOString(), endTime: end.toISOString() }
          : {}),
      });
      success('預約已更新');
      onClose();
    } catch (err) {
      if (err instanceof BookingConflictError) {
        error('所選時段該會議室已被預約，請更換時間或會議室。');
      } else {
        error('更新失敗,請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!editingBookingId) return;
    if (!window.confirm('確定要刪除此預約？此動作無法復原。')) return;
    try {
      await deleteBooking(editingBookingId);
      success('預約已刪除');
      onClose();
    } catch {
      error('刪除失敗,請稍後再試');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">

        {/* Modal Header */}
        <div className="px-8 py-5 border-b bg-slate-50 flex justify-between items-center">
          <div>
             <h3 className="font-bold text-xl text-slate-800">{editingBookingId ? '預約詳情' : '預約會議室'}</h3>
             <p className="text-sm text-slate-500 mt-1">
                {editingBookingId
                    ? (canEditBooking ? '可直接修改會議內容、時間或會議室' : '此預約已無法修改，如需異動請刪除後重新預約')
                    : '請設定時間並選擇可用的會議室'}
             </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full p-1 transition-colors"><X/></button>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Left: Form Inputs */}
            <div className="w-full md:w-2/5 p-8 border-r border-gray-100 bg-white overflow-y-auto">
                <form id="booking-form" onSubmit={editingBookingId ? handleSaveEdit : handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">會議主題 *</label>
                        <input required disabled={!formEditable} type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:bg-slate-50 disabled:text-slate-500" placeholder="例如：Q4 策略會議" />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">會議內容 (選填)</label>
                        <textarea
                            rows={3}
                            disabled={!formEditable}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:bg-slate-50 disabled:text-slate-500"
                            placeholder="簡述會議目的或議程..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">日期</label>
                        <input required disabled={!formEditable} type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                    </div>

                    <div className="space-y-2">
                         <label className="block text-sm font-bold text-slate-700">時間區間</label>
                         <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">開始</span>
                                <input required disabled={!formEditable} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">結束</span>
                                <input required disabled={!formEditable} type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500" />
                            </div>
                         </div>

                         {formEditable && (
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
                                onClick={() => formEditable && isAvailable && setSelectedRoom(room.id)}
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
                <Button type="button" variant="ghost" onClick={onClose}>關閉</Button>
                {formEditable && (
                    <Button onClick={editingBookingId ? handleSaveEdit : handleSubmit} disabled={submitting || !checkRoomAvailability(selectedRoom)} isLoading={submitting}>
                        {editingBookingId ? '儲存變更' : '確認預約'}
                    </Button>
                )}
             </div>
        </div>
      </div>
    </div>
  );
};
