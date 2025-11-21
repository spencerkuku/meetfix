import React, { useState } from 'react';
import { useData } from '../App';
import { UserRole } from '../types';
import { Button } from '../components/Button';
import { ShieldCheck, User, Tag, Trash2, Plus, Settings } from 'lucide-react';

export const Admin: React.FC = () => {
  const { currentUser, mockUsers, updateMockRole, repairCategories, addRepairCategory, removeRepairCategory } = useData();
  const [newCategory, setNewCategory] = useState('');

  const roleLabels = {
    [UserRole.ADMIN]: '系統管理員',
    [UserRole.MAINTENANCE]: '報修管理員',
    [UserRole.ROOM_MANAGER]: '會議室管理員',
    [UserRole.USER]: '一般使用者',
    [UserRole.GUEST]: '訪客'
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCategory.trim()) {
      addRepairCategory(newCategory.trim());
      setNewCategory('');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">後台管理與設定</h1>
        <div className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1">
           <User size={14}/> 目前權限: {roleLabels[currentUser?.role || UserRole.GUEST]}
        </div>
      </div>

      {/* User Management Section - Restricted to ADMIN only */}
      {currentUser?.role === UserRole.ADMIN && (
        <section className="space-y-6 animate-fade-in">
          <div className="flex justify-between items-center border-b pb-2">
             <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><User size={24} className="text-blue-600"/> 人員權限管理</h2>
             <div className="text-sm text-slate-400">僅系統管理員可見</div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">使用者</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">目前角色</th>
                  <th className="p-4">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mockUsers.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="p-4 flex items-center gap-3">
                      <img src={user.avatar} alt="" className="w-8 h-8 rounded-full bg-gray-200" />
                      <span className="font-medium text-slate-700">{user.name}</span>
                    </td>
                    <td className="p-4 text-slate-500">{user.email}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                        ${user.role === UserRole.ADMIN ? 'bg-red-100 text-red-800' : 
                          user.role === UserRole.MAINTENANCE ? 'bg-orange-100 text-orange-800' : 
                          user.role === UserRole.ROOM_MANAGER ? 'bg-purple-100 text-purple-800' : 
                          'bg-blue-100 text-blue-800'}`}>
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <select 
                          value={user.role}
                          onChange={(e) => updateMockRole(user.id, e.target.value as UserRole)}
                          className="text-sm border rounded px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          {Object.values(UserRole).filter(r => r !== 'GUEST').map(role => (
                            <option key={role} value={role}>{roleLabels[role]}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      
      {/* Category Management Section - Available to ADMIN and MAINTENANCE */}
      <section className="space-y-6 animate-fade-in">
         <div className="flex justify-between items-center border-b pb-2">
           <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Tag size={24} className="text-orange-500"/> 報修分類管理</h2>
         </div>
         
         <div className="bg-white rounded-xl border shadow-sm p-6">
            <p className="text-sm text-slate-500 mb-4">設定報修表單中的問題分類選項。刪除分類不會影響歷史報修單，僅影響未來新增的選項。</p>
            
            <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
               <input 
                  type="text" 
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="輸入新分類名稱 (例如：水電設備、清潔衛生...)"
                  className="flex-1 border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
               />
               <Button type="submit"><Plus size={18} className="mr-1"/> 新增分類</Button>
            </form>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
               {repairCategories.map(cat => (
                 <div key={cat} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 group hover:border-blue-300 transition-colors">
                    <span className="text-slate-700 text-sm font-medium">{cat}</span>
                    <button 
                       onClick={() => removeRepairCategory(cat)}
                       className="text-slate-300 hover:text-red-500 transition-colors"
                       title="刪除分類"
                    >
                       <Trash2 size={16}/>
                    </button>
                 </div>
               ))}
            </div>
         </div>
      </section>

      {/* System Hints */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex gap-3 items-start">
        <ShieldCheck className="text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="font-semibold text-blue-800 text-sm">系統提示</h4>
          <div className="text-xs text-blue-600 mt-1 space-y-1">
             {currentUser?.role === UserRole.ADMIN && (
                <p>• 更改使用者角色權限將立即生效，使用者重新登入後可見新介面。</p>
             )}
             <p>• 報修分類的新增與刪除會即時反映在「報修管理」頁面的表單中。</p>
          </div>
        </div>
      </div>
    </div>
  );
};
