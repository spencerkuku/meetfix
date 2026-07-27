
import React, { useState } from 'react';
import { useData } from '../App';
import { RepairStatus } from '../types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { CheckCircle, MessageSquare, X, User, Tag, MapPin, Phone, ClipboardList } from 'lucide-react';

export const RepairManagement: React.FC = () => {
  const { repairs, updateRepair } = useData();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reply State
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const filteredRepairs = repairs.filter(r => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PENDING') return r.status !== RepairStatus.COMPLETED;
    if (activeTab === 'COMPLETED') return r.status === RepairStatus.COMPLETED;
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleStatusUpdate = async (id: string, status: RepairStatus) => {
    setBusyId(id);
    try {
      await updateRepair(id, { status });
      success(status === RepairStatus.IN_PROGRESS ? '已接手處理' : '案件已標記為完成');
    } catch {
      error('更新失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  const handleReplySubmit = async (id: string) => {
    setBusyId(id);
    try {
      await updateRepair(id, { adminReply: replyText });
      setReplyId(null);
      setReplyText('');
      success("回覆已發送");
    } catch {
      error('回覆發送失敗，請稍後再試');
    } finally {
      setBusyId(null);
    }
  };

  const getStatusColor = (status: RepairStatus) => {
    switch (status) {
      case RepairStatus.PENDING: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case RepairStatus.IN_PROGRESS: return 'bg-blue-100 text-blue-800 border-blue-200';
      case RepairStatus.COMPLETED: return 'bg-green-100 text-green-800 border-green-200';
    }
  };

  const getStatusText = (status: RepairStatus) => {
    switch (status) {
      case RepairStatus.PENDING: return '待處理';
      case RepairStatus.IN_PROGRESS: return '處理中';
      case RepairStatus.COMPLETED: return '已完成';
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
        {['PENDING', 'COMPLETED', 'ALL'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {tab === 'ALL' ? '所有工單' : (tab === 'PENDING' ? '待處理/處理中' : '已結案紀錄')}
          </button>
        ))}
      </div>

      <div className="grid gap-4 animate-fade-in">
        {filteredRepairs.map(ticket => (
            <div key={ticket.id} className={`bg-white rounded-lg border p-5 shadow-sm transition-shadow hover:shadow-md ${ticket.status === RepairStatus.PENDING ? 'border-l-4 border-l-yellow-400' : 'border-l-4 border-l-green-400'}`}>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Content Section */}
                <div className="flex-1 space-y-3">
                   <div className="flex items-start justify-between">
                       <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getStatusColor(ticket.status)}`}>
                            {getStatusText(ticket.status)}
                            </span>
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                            <Tag size={10} /> {ticket.category}
                            </span>
                       </div>
                       <span className="text-xs text-slate-400">{new Date(ticket.createdAt).toLocaleString()}</span>
                   </div>

                   <div>
                        <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                        <MapPin size={18} className="text-slate-400"/>
                        {ticket.location}
                        </h3>
                        <p className="text-slate-700 mt-2 p-3 bg-slate-50 rounded border border-slate-100">{ticket.description}</p>
                   </div>

                   {/* Full User Info for Maintenance Staff */}
                   <div className="flex flex-wrap gap-4 pt-2 text-sm text-slate-600 bg-blue-50/50 p-2 rounded border border-blue-100">
                        <div className="flex items-center gap-1"><User size={14}/> {ticket.userName} {ticket.userClass && `(${ticket.userClass})`}</div>
                        {ticket.userPhone && <div className="flex items-center gap-1 text-blue-700 font-mono"><Phone size={14}/> {ticket.userPhone}</div>}
                   </div>
                </div>

                {/* Image Section */}
                {ticket.imageUrl && (
                    <div className="w-full lg:w-48 h-48 flex-shrink-0">
                        <img src={ticket.imageUrl} alt="Issue" className="w-full h-full object-cover rounded-lg border bg-slate-100 cursor-pointer hover:opacity-90" onClick={() => window.open(ticket.imageUrl, '_blank')} title="點擊查看大圖"/>
                    </div>
                )}
                
                {/* Actions Section */}
                <div className="flex flex-col gap-2 lg:min-w-[180px] lg:border-l lg:pl-6 border-gray-100 justify-center">
                    {ticket.status === RepairStatus.PENDING && (
                        <Button size="sm" isLoading={busyId === ticket.id} disabled={busyId === ticket.id} onClick={() => handleStatusUpdate(ticket.id, RepairStatus.IN_PROGRESS)} className="w-full bg-blue-600 hover:bg-blue-700">
                            接手處理
                        </Button>
                    )}

                    {ticket.status === RepairStatus.IN_PROGRESS && (
                        <Button size="sm" isLoading={busyId === ticket.id} disabled={busyId === ticket.id} onClick={() => handleStatusUpdate(ticket.id, RepairStatus.COMPLETED)} className="w-full bg-green-600 hover:bg-green-700">
                            <CheckCircle size={16} className="mr-1"/> 標記完成
                        </Button>
                    )}

                    {ticket.status !== RepairStatus.COMPLETED && (
                        <Button size="sm" variant="outline" onClick={() => setReplyId(ticket.id)} disabled={!!replyId || busyId === ticket.id} className="w-full">
                            <MessageSquare size={16} className="mr-1"/> 填寫回覆
                        </Button>
                    )}

                    {ticket.status === RepairStatus.COMPLETED && (
                         <div className="text-center py-2 text-green-600 font-bold text-sm border border-green-200 bg-green-50 rounded">
                             已結案
                         </div>
                    )}
                </div>
              </div>

              {/* Reply Input Area */}
              {(replyId === ticket.id || ticket.adminReply) && (
                <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in">
                    {replyId === ticket.id ? (
                        <div className="bg-slate-50 p-4 rounded border border-blue-200 shadow-sm">
                            <label className="block text-sm font-bold text-slate-700 mb-2">維修回覆與備註</label>
                            <div className="flex gap-2">
                                <input 
                                type="text" 
                                value={replyText} 
                                onChange={e => setReplyText(e.target.value)} 
                                className="flex-1 text-sm border rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="例如：已更換零件，測試正常..."
                                autoFocus
                                />
                                <Button size="sm" isLoading={busyId === ticket.id} disabled={busyId === ticket.id} onClick={() => handleReplySubmit(ticket.id)}>發送</Button>
                                <Button size="sm" variant="ghost" disabled={busyId === ticket.id} onClick={() => setReplyId(null)}><X size={16}/></Button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-50 p-3 rounded text-sm border border-gray-200">
                            <div className="flex items-center gap-2 font-bold text-slate-700 mb-1">
                                <MessageSquare size={14} /> 歷史回覆:
                            </div>
                            <p className="text-slate-600 pl-6">{ticket.adminReply}</p>
                        </div>
                    )}
                </div>
              )}
            </div>
        ))}
        
        {filteredRepairs.length === 0 && (
          <div className="text-center py-16 text-slate-400 bg-white rounded-lg border border-dashed">
            <CheckCircle className="mx-auto h-16 w-16 text-slate-200 mb-4"/>
            <p className="text-lg">目前沒有相關的工單</p>
          </div>
        )}
      </div>
    </div>
  );
};
