
import React, { useState } from 'react';
import { useData } from '../App';
import { DoorOpen, Users, Monitor, Plus, Trash2, X, Image as ImageIcon, Upload, CheckSquare, Square, Edit } from 'lucide-react';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { Room } from '../types';

export const RoomManagement: React.FC = () => {
  const { rooms, addRoom, updateRoom, removeRoom } = useData();
  const { success, error } = useToast();
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [equipment, setEquipment] = useState('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);

  const resetForm = () => {
    setEditingRoomId(null);
    setName('');
    setLocation('');
    setCapacity('');
    setEquipment('');
    setImagePreview('');
    setPhotoFile(null);
    setRequiresApproval(false);
  };

  const handleEditRoom = (room: Room) => {
    setEditingRoomId(room.id);
    setName(room.name);
    setLocation(room.location);
    setCapacity(room.capacity !== null ? String(room.capacity) : '');
    setEquipment(room.equipment.join(', '));
    setImagePreview(room.imageUrl ?? '');
    setPhotoFile(null);
    setRequiresApproval(room.requiresApproval);
    setShowModal(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const equipmentList = equipment.split(',').map(s => s.trim()).filter(Boolean);
    const capacityValue = capacity.trim() ? parseInt(capacity, 10) : undefined;

    setSubmitting(true);
    try {
      if (editingRoomId) {
        await updateRoom(editingRoomId, { name, location, capacity: capacityValue, equipment: equipmentList, requiresApproval }, photoFile ?? undefined);
        success("會議室資料更新成功");
      } else {
        await addRoom({ name, location, capacity: capacityValue, equipment: equipmentList, requiresApproval }, photoFile ?? undefined);
        success("已新增會議室");
      }
      setShowModal(false);
      resetForm();
    } catch {
      error("操作失敗,請稍後再試");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRoom = async (id: string, name: string) => {
    if (window.confirm(`確定要刪除「${name}」嗎？此動作無法復原。`)) {
      try {
        await removeRoom(id);
        success("會議室已刪除");
      } catch {
        error("刪除失敗,請稍後再試");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <h1 className="text-2xl font-bold text-slate-800">會議室管理</h1>
         <Button onClick={() => { resetForm(); setShowModal(true); }}>
           <Plus size={18} /> 新增會議室
         </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map(room => (
          <div key={room.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group relative">
            <div className="h-40 bg-slate-200 relative overflow-hidden">
               {room.imageUrl ? (
                 <img src={room.imageUrl} alt={room.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
               ) : (
                 <div className="w-full h-full flex items-center justify-center text-slate-300">
                   <ImageIcon size={40} />
                 </div>
               )}
               <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/60 to-transparent p-4">
                 <h3 className="text-white font-bold text-lg">{room.name}</h3>
                 <p className="text-white/80 text-xs">{room.location}</p>
               </div>
               {room.requiresApproval && (
                 <div className="absolute top-2 left-2 bg-yellow-500 text-white text-[10px] px-2 py-1 rounded-full font-bold shadow-sm">
                   需審核
                 </div>
               )}
               
               <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                        onClick={() => handleEditRoom(room)}
                        className="bg-white/90 text-blue-600 p-1.5 rounded-full shadow-sm hover:bg-blue-50 transition-colors"
                        title="編輯會議室"
                    >
                        <Edit size={16} />
                    </button>
                    <button 
                        onClick={() => handleDeleteRoom(room.id, room.name)}
                        className="bg-white/90 text-red-500 p-1.5 rounded-full shadow-sm hover:bg-red-50 transition-colors"
                        title="刪除會議室"
                    >
                        <Trash2 size={16} />
                    </button>
               </div>
            </div>
            <div className="p-4 space-y-4">
               <div className="flex items-center gap-4 text-sm text-slate-600">
                  <div className="flex items-center gap-1"><Users size={16}/> {room.capacity !== null ? `${room.capacity} 人座` : '容納人數未設定'}</div>
               </div>
               
               <div>
                 <p className="text-xs font-semibold text-slate-400 uppercase mb-2">設備清單</p>
                 <div className="flex flex-wrap gap-2">
                   {room.equipment.length > 0 ? room.equipment.map((eq, i) => (
                     <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full flex items-center gap-1">
                       <Monitor size={10}/> {eq}
                     </span>
                   )) : (
                     <span className="text-xs text-slate-300">無設備</span>
                   )}
                 </div>
               </div>
            </div>
          </div>
        ))}
        
        <div 
          onClick={() => { resetForm(); setShowModal(true); }}
          className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center p-6 text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer h-full min-h-[300px]"
        >
           <DoorOpen size={40} className="mb-2"/>
           <span className="font-medium">新增會議室</span>
        </div>
      </div>

      {/* Add/Edit Room Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">
            <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">{editingRoomId ? '編輯會議室' : '新增會議室'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X/></button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">會議室名稱 *</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="例如：D405 創意發想室"
                  className="w-full border rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">地點 *</label>
                <input
                  required
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="例如：4樓 D405"
                  className="w-full border rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">容納人數</label>
                <input
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={e => setCapacity(e.target.value)}
                  placeholder="尚未設定"
                  className="w-full border rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">提供設備 (以逗號分隔)</label>
                <input 
                  type="text" 
                  value={equipment} 
                  onChange={e => setEquipment(e.target.value)} 
                  placeholder="例如：投影機, 白板, 視訊系統"
                  className="w-full border rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>

              <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">會議室圖片 (選填)</label>
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
                          onClick={(e) => { e.preventDefault(); setImagePreview(''); }}
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

              <div 
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setRequiresApproval(!requiresApproval)}
              >
                 <div className={`w-5 h-5 border rounded flex items-center justify-center transition-colors ${requiresApproval ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'}`}>
                    {requiresApproval && <CheckSquare size={14}/>}
                 </div>
                 <span className="text-sm text-slate-700">需要人工審核預約</span>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t mt-2">
                <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>取消</Button>
                <Button type="submit" disabled={submitting} isLoading={submitting}>{editingRoomId ? '更新設定' : '確認新增'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
