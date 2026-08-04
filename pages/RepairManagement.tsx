
import React, { useState } from 'react';
import { useRepairsData } from '../state/repairs';
import { RepairStatus, RepairTicket } from '../types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { nextRepairStatus, revertRepairStatus, RepairStatusValue } from 'repair-visibility';
import { CheckCircle, Image as ImageIcon, Info, MessageSquare, RotateCcw, X, User, Tag, MapPin, Phone, ClipboardList, ZoomIn } from 'lucide-react';

// One badge style per status — shared everywhere so PENDING/IN_PROGRESS/
// COMPLETED read consistently (previously IN_PROGRESS and COMPLETED shared
// the same green accent).
const STATUS_STYLE: Record<RepairStatus, { badge: string; label: string }> = {
  [RepairStatus.PENDING]: { badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: '待處理' },
  [RepairStatus.IN_PROGRESS]: { badge: 'bg-blue-100 text-blue-800 border-blue-200', label: '處理中' },
  [RepairStatus.COMPLETED]: { badge: 'bg-green-100 text-green-800 border-green-200', label: '已完成' },
};

// Toast copy for "the ticket is now in status X" — shared by both directions:
// a forward transition (接手處理/標記完成, shown with an Undo action instead
// of a confirmation modal) and the default message after a revert/undo.
const STATUS_CHANGE_TOAST_LABEL: Record<RepairStatus, string> = {
  [RepairStatus.PENDING]: '已退回待處理',
  [RepairStatus.IN_PROGRESS]: '已標記為處理中',
  [RepairStatus.COMPLETED]: '案件已標記為完成',
};

const REVERT_ACTION_LABEL: Record<RepairStatus, string> = {
  [RepairStatus.PENDING]: '',
  [RepairStatus.IN_PROGRESS]: '退回待處理',
  [RepairStatus.COMPLETED]: '重新開啟（退回處理中）',
};

// repair-visibility's status functions are string-union-typed so the
// package doesn't need to depend on this app's Prisma-derived enum — the
// values are identical, so the cast is safe.
const toStatusValue = (status: RepairStatus): RepairStatusValue => status as unknown as RepairStatusValue;
const fromStatusValue = (status: RepairStatusValue): RepairStatus => status as unknown as RepairStatus;

// A single pending REVERT awaiting explicit confirmation. Forward actions
// (接手處理/標記完成) apply immediately with an Undo toast instead — only
// reverts (which undo another user's progress) still gate on a modal.
type PendingRevert = {
  ticket: RepairTicket;
  status: RepairStatus;
  label: string;
};

export const RepairManagement: React.FC = () => {
  const { repairs, updateRepair } = useRepairsData();
  const { success, error, showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED' | 'ALL'>('ACTIVE');

  const filteredRepairs = repairs
    .filter(r => {
      if (activeTab === 'ALL') return true;
      if (activeTab === 'ACTIVE') return r.status !== RepairStatus.COMPLETED;
      return r.status === RepairStatus.COMPLETED;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // The ticket open in the detail drawer — photo, full description, reporter
  // info, status change, and reply all live here as one surface.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewingTicket = repairs.find(r => r.id === viewingId) || null;
  const [replyText, setReplyText] = useState('');

  // Revert confirmation and inline photo preview.
  const [pendingRevert, setPendingRevert] = useState<PendingRevert | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const openDetail = (ticket: RepairTicket) => {
    setViewingId(ticket.id);
    setReplyText(ticket.adminReply || '');
  };

  const closeDetail = () => {
    setViewingId(null);
    setReplyText('');
  };

  const handleStatusUpdate = async (id: string, status: RepairStatus) => {
    setBusyId(id);
    try {
      await updateRepair(id, { status });
      success(STATUS_CHANGE_TOAST_LABEL[status]);
    } catch {
      error('更新失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  // Forward action (接手處理 / 標記完成): apply immediately, no confirmation
  // — the toast's Undo action reverts via revertRepairStatus (the same
  // policy function the confirm-modal path uses), not a captured value, so
  // Undo can't drift from that policy if the status model ever changes.
  const handleAdvance = async (ticket: RepairTicket) => {
    const targetValue = nextRepairStatus(toStatusValue(ticket.status));
    if (!targetValue) return;
    const target = fromStatusValue(targetValue);
    const undoTargetValue = revertRepairStatus(targetValue);

    setBusyId(ticket.id);
    try {
      await updateRepair(ticket.id, { status: target });
      showToast(STATUS_CHANGE_TOAST_LABEL[target], 'success', {
        action: undoTargetValue
          ? { label: '復原', onClick: () => handleStatusUpdate(ticket.id, fromStatusValue(undoTargetValue)) }
          : undefined,
        duration: 5000,
      });
    } catch {
      error('更新失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  const openRevertConfirm = (ticket: RepairTicket) => {
    const targetValue = revertRepairStatus(toStatusValue(ticket.status));
    if (!targetValue) return;
    const target = fromStatusValue(targetValue);
    setPendingRevert({ ticket, status: target, label: REVERT_ACTION_LABEL[ticket.status] });
  };

  const confirmPendingRevert = async () => {
    if (!pendingRevert) return;
    const { ticket, status } = pendingRevert;
    setPendingRevert(null);
    await handleStatusUpdate(ticket.id, status);
  };

  const handleReplySubmit = async (id: string) => {
    setBusyId(id);
    try {
      await updateRepair(id, { adminReply: replyText });
      success('回覆已發送');
    } catch {
      error('回覆發送失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  // Shared between the desktop table row and the mobile card — the action
  // set is identical, only the surrounding layout differs.
  const renderTicketActions = (ticket: RepairTicket) => (
    <>
      {ticket.status === RepairStatus.PENDING && (
        <Button
          size="sm"
          disabled={busyId === ticket.id}
          onClick={() => handleAdvance(ticket)}
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
            onClick={() => handleAdvance(ticket)}
            className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
          >
            標記完成
          </Button>
          <button
            disabled={busyId === ticket.id}
            onClick={() => openRevertConfirm(ticket)}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded"
            title="退回待處理"
            aria-label="退回待處理"
          >
            <RotateCcw size={14}/>
          </button>
        </>
      )}
      {ticket.status === RepairStatus.COMPLETED && (
        <button
          disabled={busyId === ticket.id}
          onClick={() => openRevertConfirm(ticket)}
          className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded"
          title="重新開啟"
          aria-label="重新開啟"
        >
          <RotateCcw size={14}/>
        </button>
      )}
      <button
        onClick={() => openDetail(ticket)}
        className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded"
        title="查看詳情與回覆"
        aria-label="查看詳情與回覆"
      >
        <Info size={14}/>
      </button>
    </>
  );

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

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden animate-fade-in">
        {filteredRepairs.length > 0 ? (
          <>
            {/* Desktop table — md and up */}
            <div className="hidden md:block overflow-x-auto">
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
                        <div className="flex items-start gap-1.5">
                          <p className="text-slate-700 line-clamp-2 flex-1">{ticket.description}</p>
                          {ticket.imageUrl && (
                            <button
                              onClick={() => setPreviewImageUrl(ticket.imageUrl!)}
                              className="text-slate-400 hover:text-blue-600 flex-shrink-0 mt-0.5"
                              title="有附照片，點擊放大"
                            >
                              <ImageIcon size={13} />
                            </button>
                          )}
                        </div>
                        {ticket.adminReply && (
                          <div className="mt-1 flex items-start gap-1 text-xs text-blue-700">
                            <MessageSquare size={11} className="flex-shrink-0 mt-0.5"/>
                            <span className="line-clamp-1">已回覆：{ticket.adminReply}</span>
                          </div>
                        )}
                      </td>

                      <td className="p-3 text-slate-500 whitespace-nowrap">{ticket.userName}</td>
                      <td className="p-3 text-slate-500 whitespace-nowrap">{new Date(ticket.createdAt).toLocaleDateString()}</td>

                      <td className="p-3 pr-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {renderTicketActions(ticket)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards — below md */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredRepairs.map(ticket => (
                <div key={ticket.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[ticket.status].badge}`}>
                      {STATUS_STYLE[ticket.status].label}
                    </span>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                  </div>

                  <div>
                    <div className="font-semibold text-slate-800 flex items-center gap-1">
                      <MapPin size={13} className="text-slate-400 flex-shrink-0"/>{ticket.location}
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-1">
                      <Tag size={9} />{ticket.category}
                    </span>
                  </div>

                  <div className="flex items-start gap-1.5">
                    <p className="text-slate-700 text-sm line-clamp-3 flex-1">{ticket.description}</p>
                    {ticket.imageUrl && (
                      <button
                        onClick={() => setPreviewImageUrl(ticket.imageUrl!)}
                        className="text-slate-400 hover:text-blue-600 flex-shrink-0 mt-0.5"
                        title="有附照片，點擊放大"
                        aria-label="放大照片"
                      >
                        <ImageIcon size={16} />
                      </button>
                    )}
                  </div>

                  {ticket.adminReply && (
                    <div className="flex items-start gap-1 text-xs text-blue-700">
                      <MessageSquare size={11} className="flex-shrink-0 mt-0.5"/>
                      <span className="line-clamp-2">已回覆：{ticket.adminReply}</span>
                    </div>
                  )}

                  <div className="text-xs text-slate-500">回報人：{ticket.userName}</div>

                  <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-gray-100">
                    {renderTicketActions(ticket)}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16 text-slate-400">
            <CheckCircle className="mx-auto h-12 w-12 text-slate-200 mb-3"/>
            <p>目前沒有相關的工單</p>
          </div>
        )}
      </div>

      {/* Ticket Detail Drawer — photo, full description, reporter info,
          status change, and reply all live here as one surface. */}
      {viewingTicket && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/70 p-4 pt-12 sm:pt-20 overflow-y-auto" onClick={closeDetail}>
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
              <button onClick={closeDetail} className="text-slate-400 hover:text-slate-600" aria-label="關閉"><X/></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {/* Photo — default-expanded, no click needed to see it clearly.
                  Click still opens the full-size lightbox. Omitted entirely
                  when the ticket has no photo, instead of a placeholder. */}
              {viewingTicket.imageUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewImageUrl(viewingTicket.imageUrl!)}
                  className="w-full h-56 relative group/img rounded-lg overflow-hidden border bg-slate-100"
                  title="點擊放大"
                >
                  <img src={viewingTicket.imageUrl} alt="Issue" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
                    <ZoomIn size={22} className="text-white opacity-0 group-hover/img:opacity-100 transition-opacity" />
                  </div>
                </button>
              )}

              <p className="text-slate-700 text-sm whitespace-pre-wrap p-3 bg-slate-50 rounded border border-slate-100">{viewingTicket.description}</p>
              <div className="flex flex-wrap gap-3 text-sm text-slate-600 bg-blue-50/50 p-2 rounded border border-blue-100">
                <div className="flex items-center gap-1"><User size={14}/> {viewingTicket.userName} {viewingTicket.userClass && `(${viewingTicket.userClass})`}</div>
                {viewingTicket.userPhone && <div className="flex items-center gap-1 text-blue-700 font-mono"><Phone size={14}/> {viewingTicket.userPhone}</div>}
              </div>

              {/* Status Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {viewingTicket.status === RepairStatus.PENDING && (
                  <Button
                    size="sm"
                    disabled={busyId === viewingTicket.id}
                    onClick={() => handleAdvance(viewingTicket)}
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
                      onClick={() => handleAdvance(viewingTicket)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle size={16} className="mr-1"/> 標記完成
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === viewingTicket.id}
                      onClick={() => openRevertConfirm(viewingTicket)}
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
                    onClick={() => openRevertConfirm(viewingTicket)}
                    className="text-slate-500"
                  >
                    <RotateCcw size={14} className="mr-1"/> 重新開啟
                  </Button>
                )}
              </div>

              {/* Reply — merged in from the old standalone modal so detail,
                  status, and reply are all one surface. */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <label className="block text-sm font-bold text-slate-700">維修回覆與備註</label>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="w-full text-sm border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="例如：已更換零件，測試正常..."
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    isLoading={busyId === viewingTicket.id}
                    disabled={busyId === viewingTicket.id}
                    onClick={() => handleReplySubmit(viewingTicket.id)}
                  >
                    {viewingTicket.adminReply ? '更新回覆' : '發送回覆'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revert Confirmation — the only status change still gated on an
          explicit confirm; forward progress applies immediately with an
          Undo toast instead (see handleAdvance). */}
      {pendingRevert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setPendingRevert(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-800 mb-2">確定要退回狀態嗎？</h3>
            <p className="text-sm text-slate-500 mb-1">
              「{pendingRevert.ticket.location}」— {pendingRevert.ticket.description}
            </p>
            <p className="text-sm text-slate-600 mb-6">
              將狀態變更為
              <span className={`mx-1 text-xs font-bold px-2 py-0.5 rounded border ${STATUS_STYLE[pendingRevert.status].badge}`}>
                {STATUS_STYLE[pendingRevert.status].label}
              </span>
              ，回報人會收到通知。
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPendingRevert(null)}>取消</Button>
              <Button
                isLoading={busyId === pendingRevert.ticket.id}
                onClick={confirmPendingRevert}
                className="bg-slate-700 hover:bg-slate-800"
              >
                確認{pendingRevert.label}
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
            aria-label="關閉"
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
