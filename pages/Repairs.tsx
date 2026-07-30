
import React, { useState, useEffect } from 'react';
import { useData } from '../App';
import { RepairStatus, RepairTicket, UserRole } from '../types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { CheckCircle, MessageSquare, Plus, X, Image as ImageIcon, User, Tag, MapPin, Pencil, Trash2 } from 'lucide-react';
import { canSeeReporterDetails, maskName } from 'repair-visibility';

export const Repairs: React.FC = () => {
  const { repairs, addRepair, editRepairContent, deleteRepair, currentUser, repairCategories } = useData();
  const { success, error } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');

  // The Repair Ticket being edited, or null when submitting a new one — same
  // "one modal, one editing-id switches its mode" pattern as Bookings.tsx.
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState<RepairTicket | null>(null);

  // Form State
  const [locationText, setLocationText] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');

  // Extended Form Fields
  const [userClass, setUserClass] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  // Initialize Form Defaults — pre-fills from editingTicket when editing,
  // otherwise resets to blank for a new submission.
  useEffect(() => {
    if (!showModal || !currentUser) return;
    setRemovePhoto(false);
    if (editingTicket) {
      setLocationText(editingTicket.location);
      setCategory(editingTicket.category);
      setDescription(editingTicket.description);
      setPhotoFile(null);
      setImagePreview(editingTicket.imageUrl || null);
    } else {
      setLocationText('');
      setCategory(repairCategories[0]?.name || '');
      setUserClass(currentUser.class || '');
      setUserPhone(currentUser.phone || '');
      setDescription('');
      setPhotoFile(null);
      setImagePreview(null);
    }
  }, [showModal, currentUser, repairCategories, editingTicket]);

  const closeModal = () => {
    setShowModal(false);
    setEditingTicketId(null);
    setEditingTicket(null);
  };

  const openCreateModal = () => {
    setEditingTicketId(null);
    setEditingTicket(null);
    setShowModal(true);
  };

  // Only a PENDING ticket can be edited/deleted, by its reporter or an ADMIN
  // — mirrors Booking's "future and still active" editability rule, with
  // RepairStatus as the analog for "hasn't started yet" (see CONTEXT.md).
  const canEditTicket = (ticket: RepairTicket): boolean => {
    if (!currentUser) return false;
    const isOwnerOrAdmin = ticket.userId === currentUser.id || currentUser.role === UserRole.ADMIN;
    return isOwnerOrAdmin && ticket.status === RepairStatus.PENDING;
  };

  const openEditModal = (ticket: RepairTicket) => {
    if (!canEditTicket(ticket)) return;
    setEditingTicketId(ticket.id);
    setEditingTicket(ticket);
    setShowModal(true);
  };

  const handleDeleteTicket = async (id: string) => {
    if (!window.confirm("確定要刪除此報修單？此動作無法復原。")) return;
    try {
      await deleteRepair(id);
      success("報修單已刪除");
    } catch {
      error("刪除失敗,請稍後再試");
    }
  };

  const filteredRepairs = repairs.filter(r => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PENDING') return r.status !== RepairStatus.COMPLETED;
    if (activeTab === 'COMPLETED') return r.status === RepairStatus.COMPLETED;
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setRemovePhoto(false);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setImagePreview(null);
    setRemovePhoto(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setSubmitting(true);
    try {
      if (editingTicketId) {
        await editRepairContent(
          editingTicketId,
          { location: locationText, category, description, removePhoto },
          photoFile ?? undefined,
        );
        success("報修單已更新！");
      } else {
        await addRepair(
          {
            location: locationText,
            category,
            description,
            userClass: userClass || undefined,
            userPhone: userPhone || undefined,
          },
          photoFile ?? undefined,
        );
        success("報修單已送出！");
      }
      closeModal();
    } catch {
      error(editingTicketId ? "報修單更新失敗,請稍後再試" : "報修單送出失敗,請稍後再試");
    } finally {
      setSubmitting(false);
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


  const canSeeSensitiveInfo = (ticket: RepairTicket) => {
    if (!currentUser) return false;
    return canSeeReporterDetails(currentUser.role, currentUser.id, ticket.userId);
  };

  const canReport = currentUser && currentUser.role !== UserRole.GUEST;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">設施報修</h1>
           <p className="text-slate-500">查看報修進度或通報新問題</p>
        </div>
        {canReport && (
          <Button onClick={openCreateModal}>
            <Plus size={18} /> 我要報修
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4 border-b border-gray-200">
        {['ALL', 'PENDING', 'COMPLETED'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {tab === 'ALL' ? '所有報修單' : (tab === 'PENDING' ? '待處理/進行中' : '已完成')}
          </button>
        ))}
      </div>

      <div className="grid gap-4 animate-fade-in">
        {filteredRepairs.map(ticket => {
          const isPrivileged = canSeeSensitiveInfo(ticket);
          
          return (
            <div key={ticket.id} className="bg-white rounded-lg border p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Thumbnail if exists */}
                {ticket.imageUrl && (
                  <div className="w-full md:w-32 h-32 flex-shrink-0">
                    <img src={ticket.imageUrl} alt="Issue" className="w-full h-full object-cover rounded-lg border bg-slate-100" />
                  </div>
                )}
                
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getStatusColor(ticket.status)}`}>
                      {getStatusText(ticket.status)}
                    </span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                      <Tag size={10} /> {ticket.category}
                    </span>
                    <span className="text-xs text-slate-500">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                    {canEditTicket(ticket) && (
                      <div className="flex items-center gap-1 ml-auto">
                        <button onClick={() => openEditModal(ticket)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded" title="編輯報修單">
                          <Pencil size={14}/>
                        </button>
                        <button onClick={() => handleDeleteTicket(ticket.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded" title="刪除報修單">
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                      <MapPin size={16} className="text-slate-400"/>
                      {ticket.location}
                    </h3>
                    <p className="text-slate-600 mt-1 whitespace-pre-wrap">{ticket.description}</p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                     <div className="flex items-center gap-1" title={isPrivileged ? "完整姓名" : "已隱碼"}>
                        <User size={12}/> 
                        {isPrivileged ? ticket.userName : maskName(ticket.userName)} 
                        {ticket.userClass ? ` (${ticket.userClass})` : ''}
                     </div>
                  </div>
                </div>
              </div>

              {/* Reply View (Read Only) */}
              {ticket.adminReply && (
                 <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="bg-slate-50 p-3 rounded text-sm">
                        <div className="flex items-center gap-2 font-semibold text-slate-700 mb-1">
                        <MessageSquare size={14} /> 報修管理員回覆:
                        </div>
                        <p className="text-slate-600">{ticket.adminReply}</p>
                    </div>
                 </div>
              )}
            </div>
          );
        })}
        {filteredRepairs.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-lg border border-dashed">
            <CheckCircle className="mx-auto h-12 w-12 text-slate-200 mb-3"/>
            <p>目前沒有報修紀錄</p>
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-y-auto max-h-[90vh] animate-fade-in">
            <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center sticky top-0 z-10">
              <h3 className="font-bold text-lg text-slate-800">{editingTicketId ? '編輯報修單' : '通報設施問題'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><X/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              
              {/* Row 1: Location & Category */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">問題地點 *</label>
                  <input
                    required
                    type="text"
                    value={locationText}
                    onChange={e => setLocationText(e.target.value)}
                    placeholder="例如：2樓走廊, 一樓大廳..."
                    className="w-full border rounded-md p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">問題分類 *</label>
                  <select required value={category} onChange={e => setCategory(e.target.value)} className="w-full border rounded-md p-2 bg-white">
                    {repairCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">問題描述 *</label>
                <textarea 
                  required 
                  rows={4}
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  className="w-full border rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none resize-none" 
                  placeholder="請詳細描述遇到的問題狀況、發生頻率..." 
                />
              </div>

              {/* Image Upload */}
              <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">上傳照片</label>
                 <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors relative">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    {imagePreview ? (
                      <div className="relative inline-block">
                        <img src={imagePreview} alt="Preview" className="h-32 rounded shadow-sm" />
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); handleRemovePhoto(); }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 z-10"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-slate-400 flex flex-col items-center gap-2">
                         <ImageIcon size={24} />
                         <span className="text-sm">點擊或拖曳圖片至此上傳</span>
                      </div>
                    )}
                 </div>
              </div>

              {/* Reporter Info — only collected at submission time; not part
                  of what an edit can change. */}
              {!editingTicketId && (
                <div className="bg-slate-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-bold text-slate-700 mb-3 border-b pb-2">報修人資料</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div>
                        <label className="block text-xs text-slate-500 mb-1">姓名</label>
                        <p className="text-sm text-slate-700 py-1.5">{currentUser?.name}</p>
                     </div>
                     <div>
                        <label className="block text-xs text-slate-500 mb-1">班級 / 部門</label>
                        <input type="text" value={userClass} onChange={e => setUserClass(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="例: 資訊三甲"/>
                     </div>
                     <div>
                        <label className="block text-xs text-slate-500 mb-1">聯絡電話</label>
                        <input type="tel" value={userPhone} onChange={e => setUserPhone(e.target.value)} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="09xx-xxx-xxx"/>
                     </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 text-right">* 修改此處資料僅適用於本報修單</p>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t">
                <Button type="button" variant="ghost" onClick={closeModal}>取消</Button>
                <Button type="submit" disabled={submitting} isLoading={submitting}>{editingTicketId ? '儲存變更' : '送出通報'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
