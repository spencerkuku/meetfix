
import React, { useEffect, useMemo, useState } from 'react';
import { useBookingsData } from '../state/bookings';
import { useRoomsData } from '../state/rooms';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { AuditLogEntry } from '../types';
import { BookingRevertConflictError } from '../services/bookings';
import { CheckCircle2, XCircle, Clock, User, Calendar, DoorOpen, RotateCcw, History as HistoryIcon } from 'lucide-react';

const HISTORY_ACTION_LABEL: Record<string, string> = {
  Approved: '核准',
  Rejected: '拒絕',
};

function formatDuration(startTime: string, endTime: string): string {
  const minutes = Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} 分鐘`;
  if (remainder === 0) return `${hours} 小時`;
  return `${hours} 小時 ${remainder} 分鐘`;
}

function historyDetailLabel(detail: string | null | undefined): string {
  if (!detail) return '—';
  if (detail in HISTORY_ACTION_LABEL) return HISTORY_ACTION_LABEL[detail];
  if (detail.startsWith('Reverted from ')) {
    const from = detail.replace('Reverted from ', '');
    return `復原（原為${from === 'CONFIRMED' ? '已核准' : '已拒絕'}）`;
  }
  return detail;
}

export const Approvals: React.FC = () => {
  const { bookings, approveBooking, rejectBooking, revertBooking, fetchApprovalHistory } = useBookingsData();
  const { rooms } = useRoomsData();
  const { success, info, error } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Which button on the busy card is the one actually in flight — busyId
  // alone disables both 核准/拒絕 on that card, but only one should show a
  // spinner at a time.
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');

  const pendingBookings = useMemo(() => {
    return bookings.filter(b => b.status === 'PENDING_APPROVAL');
  }, [bookings]);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    setBusyAction('approve');
    try {
      await approveBooking(id);
      success("預約已核准");
    } catch {
      error("核准失敗,請稍後再試");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm("確定要拒絕此預約嗎？")) return;
    setBusyId(id);
    setBusyAction('reject');
    try {
      await rejectBooking(id);
      info("預約已拒絕");
    } catch {
      error("拒絕失敗,請稍後再試");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  };

  const handleRevert = async (id: string) => {
    if (!window.confirm("確定要將此預約復原為待審核嗎？")) return;
    setBusyId(id);
    try {
      await revertBooking(id);
      info("預約已復原為待審核");
    } catch (err) {
      if (err instanceof BookingRevertConflictError) {
        error(err.message);
      } else {
        error("復原失敗,請稍後再試");
      }
    } finally {
      setBusyId(null);
    }
  };

  // History rows: entries where the current Booking is still CONFIRMED/
  // REJECTED with a matching reviewedAt get a 復原 button — but only on the
  // most recent entry for that Booking (earlier in the list, since it's
  // newest-first), so a Booking that's been decided more than once doesn't
  // show the action on stale rows.
  const [history, setHistory] = useState<AuditLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    if (activeTab !== 'HISTORY') return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(false);
    fetchApprovalHistory()
      .then(entries => { if (!cancelled) setHistory(entries); })
      .catch(() => { if (!cancelled) setHistoryError(true); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, fetchApprovalHistory]);

  // history is newest-first — mark only the first (most recent) row per
  // Booking so a Booking decided more than once doesn't show 復原 on its
  // older, superseded rows too.
  const isLatestRowForBooking = useMemo(() => {
    const seen = new Set<string>();
    return history.map(entry => {
      const isLatest = !seen.has(entry.targetId);
      seen.add(entry.targetId);
      return isLatest;
    });
  }, [history]);

  const canRevert = (bookingId: string) => {
    const booking = bookings.find(b => b.id === bookingId);
    return (
      !!booking &&
      !!booking.reviewedAt &&
      (booking.status === 'CONFIRMED' || booking.status === 'REJECTED')
    );
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

      <div className="flex items-center gap-4 border-b border-gray-200">
        {(['PENDING', 'HISTORY'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {tab === 'PENDING' ? '待審核' : '審核紀錄'}
          </button>
        ))}
      </div>

      {activeTab === 'HISTORY' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {historyLoading ? (
            <div className="p-12 text-center text-slate-400">載入中…</div>
          ) : historyError ? (
            <div className="p-12 text-center text-red-500">載入審核紀錄失敗，請稍後再試</div>
          ) : history.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <HistoryIcon size={32} className="mb-3 text-slate-300" />
              目前沒有審核紀錄
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">預約標題</th>
                  <th className="px-4 py-2 font-medium">動作</th>
                  <th className="px-4 py-2 font-medium">審核者</th>
                  <th className="px-4 py-2 font-medium">時間</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((entry, index) => {
                  const booking = bookings.find(b => b.id === entry.targetId);
                  return (
                    <tr key={entry.id}>
                      <td className="px-4 py-2 text-slate-700">{booking?.title ?? entry.targetId}</td>
                      <td className="px-4 py-2 text-slate-700">{historyDetailLabel(entry.detail)}</td>
                      <td className="px-4 py-2 text-slate-500">{entry.actorName}</td>
                      <td className="px-4 py-2 text-slate-500">{new Date(entry.createdAt).toLocaleString('zh-TW')}</td>
                      <td className="px-4 py-2 text-right">
                        {isLatestRowForBooking[index] && canRevert(entry.targetId) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === entry.targetId}
                            onClick={() => handleRevert(entry.targetId)}
                          >
                            <RotateCcw size={14} className="mr-1" /> 復原
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : pendingBookings.length === 0 ? (
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
              <div key={booking.id} className="bg-white rounded-xl border border-l-4 border-l-yellow-400 shadow-sm p-6 flex flex-col gap-4 animate-slide-up transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
                <div className="flex justify-between items-start gap-3">
                   <div className="min-w-0">
                      <h3 className="text-lg font-bold text-slate-800 truncate" title={booking.title}>{booking.title}</h3>
                      <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                         <DoorOpen size={14} className="shrink-0"/> <span className="truncate">{room?.name}</span>
                      </div>
                   </div>
                   <span className="shrink-0 bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                      <Clock size={12}/> 待審核
                   </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm border-t border-b border-gray-100 py-4 bg-slate-50/50 -mx-6 px-6">
                    <div className="flex items-center gap-2 text-slate-600">
                        <User size={16} className="text-slate-400 shrink-0"/>
                        <span className="font-medium truncate">{booking.userName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                        <Calendar size={16} className="text-slate-400 shrink-0"/>
                        <span>{new Date(booking.startTime).toLocaleDateString('zh-TW')}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-2 text-slate-600">
                        <div className="flex items-center gap-2">
                            <Clock size={16} className="text-slate-400 shrink-0"/>
                            <span className="font-mono tabular-nums bg-white border px-2 py-0.5 rounded shadow-sm">
                                {new Date(booking.startTime).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false})} - {new Date(booking.endTime).toLocaleTimeString('zh-TW', {hour:'2-digit', minute:'2-digit', hour12:false})}
                            </span>
                        </div>
                        <span className="text-xs text-slate-400">{formatDuration(booking.startTime, booking.endTime)}</span>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-auto pt-2">
                    <Button variant="secondary" disabled={busy} isLoading={busy && busyAction === 'reject'} className="text-red-600 hover:bg-red-50 hover:text-red-700 border-transparent" onClick={() => handleReject(booking.id)}>
                        <XCircle size={16} className="mr-1"/> 拒絕
                    </Button>
                    <Button disabled={busy} isLoading={busy && busyAction === 'approve'} className="bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow" onClick={() => handleApprove(booking.id)}>
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
