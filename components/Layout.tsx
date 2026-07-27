
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useData } from '../App';
import { UserRole } from '../types';
import { getGoogleLinkUrl, getToken } from '../services/auth';
import { useToast } from './Toast';
import {
  Calendar,
  Wrench,
  LayoutDashboard,
  DoorOpen,
  UserCircle,
  X,
  Edit2,
  Settings,
  FileCheck,
  LogOut,
  Menu,
  ClipboardList,
  History,
  CheckCircle2
} from 'lucide-react';
import { Button } from './Button';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, logout, updateUser } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  // Profile Form State
  const [profileName, setProfileName] = useState('');
  const [profileClass, setProfileClass] = useState('');
  const [profilePhone, setProfilePhone] = useState('');

  const isActive = (path: string) => location.pathname === path;
  
  const navItemClass = (path: string) => `
    flex items-center gap-3 px-3 py-2 rounded-lg transition-all
    ${isActive(path) ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'}
  `;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleOpenProfile = () => {
    if (!currentUser) return;
    setProfileName(currentUser.name);
    setProfileClass(currentUser.class || '');
    setProfilePhone(currentUser.phone || '');
    setShowProfileModal(true);
  };

  const handleLinkGoogle = async () => {
    const token = getToken();
    if (!token) return;
    setLinkingGoogle(true);
    try {
      const url = await getGoogleLinkUrl(token);
      window.location.href = url;
    } catch (err) {
      showError(err instanceof Error ? err.message : '無法啟動 Google 連結，請稍後再試');
      setLinkingGoogle(false);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    updateUser(currentUser.id, {
      name: profileName,
      class: profileClass,
      phone: profilePhone
    });
    setShowProfileModal(false);
  };

  // Definition of Navigation Groups
  const generalItems = [
    { 
      path: '/bookings', 
      label: '會議室預約', 
      icon: <Calendar size={20} />, 
      roles: [UserRole.GUEST, UserRole.USER, UserRole.ROOM_MANAGER, UserRole.ADMIN, UserRole.MAINTENANCE] 
    },
    { 
      path: '/repairs', 
      label: '設施報修', 
      icon: <Wrench size={20} />, 
      roles: [UserRole.GUEST, UserRole.USER, UserRole.MAINTENANCE, UserRole.ROOM_MANAGER, UserRole.ADMIN] 
    },
  ];

  const managementItems = [
    { 
      path: '/dashboard', 
      label: '統計儀表板', 
      icon: <LayoutDashboard size={20} />, 
      roles: [UserRole.MAINTENANCE, UserRole.ROOM_MANAGER, UserRole.ADMIN] 
    },
    { 
      path: '/repair-management', 
      label: '報修作業中心', 
      icon: <ClipboardList size={20} />, 
      roles: [UserRole.MAINTENANCE, UserRole.ADMIN] 
    },
    { 
      path: '/approvals', 
      label: '預約審核', 
      icon: <FileCheck size={20} />, 
      roles: [UserRole.ROOM_MANAGER, UserRole.ADMIN] 
    },
    { 
      path: '/rooms', 
      label: '會議室設定', 
      icon: <DoorOpen size={20} />, 
      roles: [UserRole.ROOM_MANAGER, UserRole.ADMIN] 
    },
    {
      path: '/admin',
      label: '系統設定',
      icon: <Settings size={20} />,
      roles: [UserRole.ADMIN, UserRole.MAINTENANCE]
    },
    {
      path: '/audit-log',
      label: '稽核紀錄',
      icon: <History size={20} />,
      roles: [UserRole.ADMIN]
    },
  ];

  const hasAccess = (roles: UserRole[]) => {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  };

  const hasAnyManagementAccess = managementItems.some(item => hasAccess(item.roles));

  const renderNav = () => (
    <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
      {/* General Section */}
      <div className="space-y-1">
        <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">一般功能</div>
        {generalItems.map((item) => {
          // Guest access logic
          if (!currentUser && !['/bookings', '/repairs'].includes(item.path)) return null;
          if (currentUser && !item.roles.includes(currentUser.role)) return null;

          return (
            <Link key={item.path} to={item.path} className={navItemClass(item.path)} onClick={() => setMobileMenuOpen(false)}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Management Section - Separated by Divider */}
      {currentUser && hasAnyManagementAccess && (
        <div className="space-y-1">
          <div className="my-4 border-t border-slate-200" />
          <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">管理專區</div>
          
          {managementItems.map((item) => {
             if (!hasAccess(item.roles)) return null;
             return (
              <Link key={item.path} to={item.path} className={navItemClass(item.path)} onClick={() => setMobileMenuOpen(false)}>
                {item.icon}
                <span>{item.label}</span>
              </Link>
             );
          })}
        </div>
      )}
    </nav>
  );

  const getRoleName = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN: return '系統管理員';
      case UserRole.MAINTENANCE: return '報修管理員';
      case UserRole.ROOM_MANAGER: return '會議室管理員';
      case UserRole.USER: return '一般使用者';
      case UserRole.GUEST: return '訪客';
      default: return role;
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 fixed h-full z-20 hidden md:flex flex-col shadow-sm">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xl">
            <Calendar className="h-8 w-8" />
            <span>MeetFix</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">智慧會議與報修系統</p>
        </div>

        {renderNav()}

        <div className="p-4 border-t border-gray-100 bg-slate-50/50">
          {currentUser ? (
            <div className="space-y-4">
              <div 
                className="flex items-center gap-3 px-2 cursor-pointer hover:bg-white rounded-lg p-2 transition-colors group relative border border-transparent hover:border-slate-200 hover:shadow-sm"
                onClick={handleOpenProfile}
                title="點擊編輯個人資料"
              >
                <div className="relative">
                   <img src={currentUser.avatar} alt={currentUser.name} className="w-10 h-10 rounded-full bg-slate-200 object-cover" />
                   <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                      <Edit2 size={10} className="text-slate-500"/>
                   </div>
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium truncate group-hover:text-blue-600 transition-colors">{currentUser.name}</p>
                  <p className="text-xs text-slate-500 truncate">{getRoleName(currentUser.role)}</p>
                </div>
              </div>
              <Button variant="outline" onClick={handleLogout} className="w-full justify-start text-sm bg-white">
                <LogOut size={16} />
                登出
              </Button>
            </div>
          ) : (
            <Button onClick={() => navigate('/')} className="w-full">
              登入
            </Button>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 w-full h-14 bg-white border-b z-30 flex items-center px-4 justify-between shadow-sm">
         <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X size={24}/> : <Menu size={24}/>}
            </Button>
            <span className="font-bold text-blue-600 text-lg">MeetFix</span>
         </div>
         {currentUser ? (
             <div onClick={handleOpenProfile} className="cursor-pointer">
                <img src={currentUser.avatar} className="w-8 h-8 rounded-full border border-slate-200"/>
             </div>
         ) : (
             <Button variant="ghost" size="sm" onClick={() => navigate('/')}><UserCircle/></Button>
         )}
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-20 bg-white pt-14 flex flex-col animate-fade-in">
           {renderNav()}
           <div className="p-4 border-t mt-auto">
              {currentUser && (
                 <Button variant="secondary" onClick={handleLogout} className="w-full">
                    <LogOut size={16}/> 登出
                 </Button>
              )}
           </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 mt-14 md:mt-0 overflow-x-hidden">
        {children}
      </main>

      {/* Profile Modal */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in">
            <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-lg text-slate-800">編輯個人資料</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-slate-600"><X/></button>
            </div>
            <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
              <div className="flex justify-center mb-6">
                <img src={currentUser.avatar} alt="" className="w-24 h-24 rounded-full bg-slate-100 object-cover ring-4 ring-slate-50" />
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">Google 帳號連結</p>
                  <p className="text-xs text-slate-500 truncate">
                    {currentUser.googleLinked ? '已連結，Booking 會自動同步到 Google 日曆' : '連結後可自動同步 Booking 到 Google 日曆'}
                  </p>
                </div>
                {currentUser.googleLinked ? (
                  <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium shrink-0">
                    <CheckCircle2 size={16} /> 已連結
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 bg-white"
                    disabled={linkingGoogle}
                    onClick={handleLinkGoogle}
                  >
                    {linkingGoogle ? '連結中…' : '連結 Google'}
                  </Button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
                <input 
                  required 
                  type="text" 
                  value={profileName} 
                  onChange={e => setProfileName(e.target.value)} 
                  className="w-full border rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">班級 / 部門</label>
                <input 
                  type="text" 
                  value={profileClass} 
                  onChange={e => setProfileClass(e.target.value)} 
                  placeholder="例如：資訊三甲"
                  className="w-full border rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">聯絡電話</label>
                <input 
                  type="tel" 
                  value={profilePhone} 
                  onChange={e => setProfilePhone(e.target.value)} 
                  placeholder="09xx-xxx-xxx"
                  className="w-full border rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t mt-2">
                <Button type="button" variant="ghost" onClick={() => setShowProfileModal(false)}>取消</Button>
                <Button type="submit">儲存變更</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
