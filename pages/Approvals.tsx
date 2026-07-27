
import React, { useMemo, useState } from 'react';
import { useData } from '../App';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { CheckCircle2, XCircle, Clock, User, Calendar, Monitor } from 'lucide-react';

export const Approvals: React.FC = () => {
  const { bookings, rooms, approveBooking, rejectBooking } = useData();
  const { success, info, error } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingBookings = useMemo(() => {
    return bookings.filter(b => b.status === 'PENDING_APPROVAL');
  }, [bookings]);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await approveBooking(id);
      success("預約已核准");
    } catch {
      error("核准失敗,請稍後再試");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm("確定要拒絕此預約嗎？")) return;
    setBusyId(id);
    try {
      await rejectBooking(id);
      info("預約已拒絕");
    } catch {
      error("拒絕失敗,請稍後再試");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">預約審核</h1>
           <p className="text-slate-500">管理需人工審核的會議室預約申請</p>
        </div>
        <div className="bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-yellow-200">
           待審核: {pendingBookings.length} 筆
        </div>
      </div>

      {pendingBookings.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-slate-400 flex flex-col items-center animate-fade-in">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 size={32} className="text-green-500"/>
            </div>
            <h3 className="text-lg font-semibold text-slate-700">目前沒有待審核的預約</h3>
            <p className="text-sm text-slate-500 mt-1">所有的預約申請都已處理完畢，真是太棒了！</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pendingBookings.map(booking => {
            const room = rooms.find(r => r.id === booking.roomId);
            const busy = busyId === booking.id;
            return (
              <div key={booking.id} className="bg-white rounded-xl border border-l-4 border-l-yellow-400 shadow-sm p-6 flex flex-col gap-4 animate-slide-up hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                   <div>
                      <h3 className="text-lg font-bold text-slate-800">{booking.title}</h3>
                      <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                         <Monitor size={14}/> {room?.name}
                      </div>
                   </div>
                   <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                      <Clock size={12}/> 待審核
                   </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm border-t border-b border-gray-100 py-4 bg-slate-50/50 -mx-6 px-6">
                    <div className="flex items-center gap-2 text-slate-600">
                        <User size={16} className="text-slate-400"/>
                        <span className="font-medium">{booking.userName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                        <Calendar size={16} className="text-slate-400"/>
                        <span>{new Date(booking.startTime).toLocaleDateString()}</span>
                    </div>
                    <div className="col-span-2 flex items-center gap-2 text-slate-600">
                        <Clock size={16} className="text-slate-400"/>
                        <span className="font-mono bg-white border px-2 py-0.5 rounded shadow-sm">
                            {new Date(booking.startTime).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false})} -
                            {new Date(booking.endTime).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false})}
                        </span>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-auto pt-2">
                    <Button variant="secondary" disabled={busy} className="text-red-600 hover:bg-red-50 hover:text-red-700 border-transparent" onClick={() => handleReject(booking.id)}>
                        <XCircle size={16} className="mr-1"/> 拒絕
                    </Button>
                    <Button disabled={busy} isLoading={busy} className="bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow" onClick={() => handleApprove(booking.id)}>
                        <CheckCircle2 size={16} className="mr-1"/> 核准預約
                    </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
