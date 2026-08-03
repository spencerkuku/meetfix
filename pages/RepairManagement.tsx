
import React, { useState } from 'react';
import { useData } from '../App';
import { RepairStatus, RepairTicket } from '../types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { CheckCircle, Image as ImageIcon, Info, MessageSquare, RotateCcw, X, User, Tag, MapPin, Phone, ClipboardList, ZoomIn } from 'lucide-react';

// One badge style per status — shared everywhere so PENDING/IN_PROGRESS/
// COMPLETED read consistently (previously IN_PROGRESS and COMPLETED shared
// the same green accent).
const STATUS_STYLE: Record<RepairStatus, { badge: string; label: string }> = {
  [RepairStatus.PENDING]: { badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: '待處理' },
  [RepairStatus.IN_PROGRESS]: { badge: 'bg-blue-100 text-blue-800 border-blue-200', label: '處理中' },
  [RepairStatus.COMPLETED]: { badge: 'bg-green-100 text-green-800 border-green-200', label: '已完成' },
};

// A single pending status change awaiting explicit confirmation — every
// transition (forward or backward) goes through this instead of firing on
// click, so a misclick can't silently move a ticket.
type PendingAction = {
  ticket: RepairTicket;
  status: RepairStatus;
  label: string;
  isRevert: boolean;
};

export const RepairManagement: React.FC = () => {
  const { repairs, updateRepair } = useData();
  const { success, error } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED' | 'ALL'>('ACTIVE');

  const filteredRepairs = repairs
    .filter(r => {
      if (activeTab === 'ALL') return true;
      if (activeTab === 'ACTIVE') return r.status !== RepairStatus.COMPLETED;
      return r.status === RepairStatus.COMPLETED;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // The ticket open in the detail drawer — photo, full description and
  // reporter info. Status change and reply are separate actions, triggered
  // straight from the table row instead of living inside this drawer.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewingTicket = repairs.find(r => r.id === viewingId) || null;

  // The ticket being replied to, in its own small modal — decoupled from
  // the detail drawer above.
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const replyingTicket = repairs.find(r => r.id === replyingId) || null;
  const [replyText, setReplyText] = useState('');

  // Status-change confirmation and inline photo preview — both replace a
  // previous single click / new-tab action with an in-page modal.
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const openReply = (ticket: RepairTicket) => {
    setReplyingId(ticket.id);
    setReplyText(ticket.adminReply || '');
  };

  const closeReply = () => {
    setReplyingId(null);
    setReplyText('');
  };

  const handleStatusUpdate = async (id: string, status: RepairStatus) => {
    setBusyId(id);
    try {
      await updateRepair(id, { status });
      const labels: Record<RepairStatus, string> = {
        [RepairStatus.PENDING]: '已退回待處理',
        [RepairStatus.IN_PROGRESS]: '已標記為處理中',
        [RepairStatus.COMPLETED]: '案件已標記為完成',
      };
      success(labels[status]);
    } catch {
      error('更新失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    const { ticket, status } = pendingAction;
    setPendingAction(null);
    await handleStatusUpdate(ticket.id, status);
  };

  const handleReplySubmit = async (id: string) => {
    setBusyId(id);
    try {
      await updateRepair(id, { adminReply: replyText });
      closeReply();
      success("回覆已發送");
    } catch {
      error('回覆發送失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <ClipboardList className="text-blue-600"/> 報修作業中心
           </h1>
           <p className="text-slate-500">維修單狀態管理與回覆</p>
        </div>
        <div className="bg-white px-3 py-1 rounded-full shadow-sm border text-sm">
           待處理案件: <span className="font-bold text-red-500">{repairs.filter(r => r.status === RepairStatus.PENDING).length}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-gray-200">
        {(['ACTIVE', 'COMPLETED', 'ALL'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {tab === 'ALL' ? '所有工單' : (tab === 'ACTIVE' ? '待處理/處理中' : '已結案紀錄')}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden animate-fade-in overflow-x-auto">
        {filteredRepairs.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-3 pl-4">狀態</th>
                <th className="p-3">地點 / 分類</th>
                <th className="p-3">問題描述</th>
                <th className="p-3">回報人</th>
                <th className="p-3">日期</th>
                <th className="p-3 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRepairs.map(ticket => (
                <tr key={ticket.id} className="text-sm align-top hover:bg-slate-50/60 transition-colors">
                  <td className="p-3 pl-4 whitespace-nowrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[ticket.status].badge}`}>
                      {STATUS_STYLE[ticket.status].label}
                    </span>
                  </td>

                  <td className="p-3 min-w-[140px]">
                    <div className="font-semibold text-slate-800 flex items-center gap-1">
                      <MapPin size={13} className="text-slate-400 flex-shrink-0"/>{ticket.location}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-1">
                      <Tag size={9} />{ticket.category}
                    </span>
                  </td>

                  <td className="p-3 min-w-[220px] max-w-[340px]">
                    <div className="flex items-center gap-1.5">
                      <p className="text-slate-700 truncate">{ticket.description}</p>
                      {ticket.imageUrl && (
                        <button
                          onClick={() => setPreviewImageUrl(ticket.imageUrl!)}
                          className="text-slate-400 hover:text-blue-600 flex-shrink-0"
                          title="有附照片，點擊放大"
                        >
                          <ImageIcon size={13} />
                        </button>
                      )}
                    </div>
                    {ticket.adminReply && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-blue-700">
                        <MessageSquare size={11} className="flex-shrink-0"/>
                        <span className="truncate">已回覆：{ticket.adminReply}</span>
                      </div>
                    )}
                  </td>

                  <td className="p-3 text-slate-500 whitespace-nowrap">{ticket.userName}</td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">{new Date(ticket.createdAt).toLocaleDateString()}</td>

                  <td className="p-3 pr-4">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {ticket.status === RepairStatus.PENDING && (
                        <Button
                          size="sm"
                          disabled={busyId === ticket.id}
                          onClick={() => setPendingAction({ ticket, status: RepairStatus.IN_PROGRESS, label: '接手處理', isRevert: false })}
                          className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap"
                        >
                          接手處理
                        </Button>
                      )}
                      {ticket.status === RepairStatus.IN_PROGRESS && (
                        <>
                          <Button
                            size="sm"
                            disabled={busyId === ticket.id}
                            onClick={() => setPendingAction({ ticket, status: RepairStatus.COMPLETED, label: '標記完成', isRevert: false })}
                            className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                          >
                            標記完成
                          </Button>
                          <button
                            disabled={busyId === ticket.id}
                            onClick={() => setPendingAction({ ticket, status: RepairStatus.PENDING, label: '退回待處理', isRevert: true })}
                            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded"
                            title="退回待處理"
                          >
                            <RotateCcw size={14}/>
                          </button>
                        </>
                      )}
                      {ticket.status === RepairStatus.COMPLETED && (
                        <button
                          disabled={busyId === ticket.id}
                          onClick={() => setPendingAction({ ticket, status: RepairStatus.IN_PROGRESS, label: '重新開啟（退回處理中）', isRevert: true })}
                          className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded"
                          title="重新開啟"
                        >
                          <RotateCcw size={14}/>
                        </button>
                      )}
                      {ticket.status !== RepairStatus.COMPLETED && (
                        <button onClick={() => openReply(ticket)} className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded" title={ticket.adminReply ? '修改回覆' : '填寫回覆'}>
                          <MessageSquare size={14}/>
                        </button>
                      )}
                      <button onClick={() => setViewingId(ticket.id)} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded" title="查看詳情">
                        <Info size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="mx-auto h-12 w-12 text-slate-200 mb-3"/>
            <p>目前沒有相關的工單</p>
          </div>
        )}
      </div>

      {/* Ticket Detail Drawer — photo, full description, reporter info, and
          status change. Reply lives in its own modal (see below), not here. */}
      {viewingTicket && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setViewingId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-start flex-shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${STATUS_STYLE[viewingTicket.status].badge}`}>
                    {STATUS_STYLE[viewingTicket.status].label}
                  </span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                    <Tag size={10} className="inline -mt-0.5 mr-1" />{viewingTicket.category}
                  </span>
                </div>
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <MapPin size={16} className="text-slate-400"/>{viewingTicket.location}
                </h3>
              </div>
              <button onClick={() => setViewingId(null)} className="text-slate-400 hover:text-slate-600"><X/></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                {viewingTicket.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewImageUrl(viewingTicket.imageUrl!)}
                    className="w-full sm:w-40 h-40 flex-shrink-0 relative group/img rounded-lg overflow-hidden border bg-slate-100"
                    title="點擊放大"
                  >
                    <img src={viewingTicket.imageUrl} alt="Issue" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
                      <ZoomIn size={22} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                    </div>
                  </button>
                )}
                <div className="flex-1 space-y-3">
                  <p className="text-slate-700 text-sm whitespace-pre-wrap p-3 bg-slate-50 rounded border border-slate-100">{viewingTicket.description}</p>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-600 bg-blue-50/50 p-2 rounded border border-blue-100">
                    <div className="flex items-center gap-1"><User size={14}/> {viewingTicket.userName} {viewingTicket.userClass && `(${viewingTicket.userClass})`}</div>
                    {viewingTicket.userPhone && <div className="flex items-center gap-1 text-blue-700 font-mono"><Phone size={14}/> {viewingTicket.userPhone}</div>}
                  </div>
                </div>
              </div>

              {/* Status Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {viewingTicket.status === RepairStatus.PENDING && (
                  <Button
                    size="sm"
                    disabled={busyId === viewingTicket.id}
                    onClick={() => setPendingAction({ ticket: viewingTicket, status: RepairStatus.IN_PROGRESS, label: '接手處理', isRevert: false })}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    接手處理
                  </Button>
                )}

                {viewingTicket.status === RepairStatus.IN_PROGRESS && (
                  <>
                    <Button
                      size="sm"
                      disabled={busyId === viewingTicket.id}
                      onClick={() => setPendingAction({ ticket: viewingTicket, status: RepairStatus.COMPLETED, label: '標記完成', isRevert: false })}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle size={16} className="mr-1"/> 標記完成
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === viewingTicket.id}
                      onClick={() => setPendingAction({ ticket: viewingTicket, status: RepairStatus.PENDING, label: '退回待處理', isRevert: true })}
                      className="text-slate-500"
                    >
                      <RotateCcw size={14} className="mr-1"/> 退回待處理
                    </Button>
                  </>
                )}

                {viewingTicket.status === RepairStatus.COMPLETED && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === viewingTicket.id}
                    onClick={() => setPendingAction({ ticket: viewingTicket, status: RepairStatus.IN_PROGRESS, label: '重新開啟（退回處理中）', isRevert: true })}
                    className="text-slate-500"
                  >
                    <RotateCcw size={14} className="mr-1"/> 重新開啟
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reply Modal — separate from the detail drawer, opened via the 回覆
          icon in the table row. */}
      {replyingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={closeReply}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-800 mb-1">維修回覆與備註</h3>
            <p className="text-sm text-slate-500 mb-4">「{replyingTicket.location}」— {replyingTicket.description}</p>
            <textarea
              rows={3}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              className="w-full text-sm border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="例如：已更換零件，測試正常..."
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="ghost" onClick={closeReply} disabled={busyId === replyingTicket.id}>取消</Button>
              <Button isLoading={busyId === replyingTicket.id} disabled={busyId === replyingTicket.id} onClick={() => handleReplySubmit(replyingTicket.id)}>發送</Button>
            </div>
          </div>
        </div>
      )}

      {/* Status Change Confirmation */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setPendingAction(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-800 mb-2">
              {pendingAction.isRevert ? '確定要退回狀態嗎？' : '確定要更新狀態嗎？'}
            </h3>
            <p className="text-sm text-slate-500 mb-1">
              「{pendingAction.ticket.location}」— {pendingAction.ticket.description}
            </p>
            <p className="text-sm text-slate-600 mb-6">
              將狀態變更為
              <span className={`mx-1 text-xs font-bold px-2 py-0.5 rounded border ${STATUS_STYLE[pendingAction.status].badge}`}>
                {STATUS_STYLE[pendingAction.status].label}
              </span>
              {pendingAction.isRevert && '，回報人會收到通知。'}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPendingAction(null)}>取消</Button>
              <Button
                isLoading={busyId === pendingAction.ticket.id}
                onClick={confirmPendingAction}
                className={pendingAction.isRevert ? 'bg-slate-700 hover:bg-slate-800' : undefined}
              >
                確認{pendingAction.label}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Photo Lightbox */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewImageUrl(null)}>
          <button
            type="button"
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2"
            title="關閉"
          >
            <X size={20} />
          </button>
          <img
            src={previewImageUrl}
            alt="報修照片預覽"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
