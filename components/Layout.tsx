
import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthData } from '../state/auth';
import { UserRole } from '../types';
import { getGoogleLinkUrl, getToken, changePassword } from '../services/auth';
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
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { Button } from './Button';
import { Avatar } from './Avatar';
import { isReporterInfoComplete, REPORTER_INFO_REQUIRED_MESSAGE } from '../reporter-info';

const SIDEBAR_COLLAPSED_KEY = 'meetfix-sidebar-collapsed';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, logout, updateProfile } = useAuthData();
  const location = useLocation();
  const navigate = useNavigate();
  const { error: showError, success: showSuccess } = useToast();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  // Desktop sidebar collapse — icon-only when true. Mobile's overlay menu is
  // unaffected. Persisted so the user's choice survives a reload.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // 報修人資料 (see pages/Repairs.tsx) — editable here independent of
  // submitting a Repair Ticket, saved via AuthProvider.updateProfile.
  const [profileClass, setProfileClass] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const isActive = (path: string) => location.pathname === path;
  
  const navItemClass = (path: string, isCollapsed: boolean) => `
    flex items-center gap-3 px-3 py-2 rounded-lg transition-all
    ${isCollapsed ? 'justify-center' : ''}
    ${isActive(path) ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'}
  `;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleOpenProfile = () => {
    if (!currentUser) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setProfileClass(currentUser.class || '');
    setProfilePhone(currentUser.phone || '');
    setShowProfileModal(true);
  };

  const handleSaveProfile = async () => {
    if (!isReporterInfoComplete(profileClass, profilePhone)) {
      showError(REPORTER_INFO_REQUIRED_MESSAGE);
      return;
    }
    setSavingProfile(true);
    try {
      await updateProfile(profileClass, profilePhone);
      showSuccess('個人資料已更新');
    } catch (err) {
      showError(err instanceof Error ? err.message : '更新個人資料失敗，請稍後再試');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    const token = getToken();
    if (!token) return;
    if (newPassword !== confirmNewPassword) {
      showError('新密碼與確認密碼不一致');
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(token, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      showSuccess('密碼已更新');
    } catch (err) {
      showError(err instanceof Error ? err.message : '修改密碼失敗，請稍後再試');
    } finally {
      setChangingPassword(false);
    }
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

  // Definition of Navigation Groups
  const generalItems = [
    {
      path: '/bookings',
      label: '會議室預約',
      icon: <Calendar size={20} />,
      roles: [UserRole.GUEST, UserRole.USER, UserRole.FACILITY_MANAGER, UserRole.ADMIN]
    },
    {
      path: '/repairs',
      label: '設施報修',
      icon: <Wrench size={20} />,
      roles: [UserRole.GUEST, UserRole.USER, UserRole.FACILITY_MANAGER, UserRole.ADMIN]
    },
  ];

  const managementItems = [
    {
      path: '/dashboard',
      label: '統計儀表板',
      icon: <LayoutDashboard size={20} />,
      roles: [UserRole.FACILITY_MANAGER, UserRole.ADMIN]
    },
    {
      path: '/repair-management',
      label: '報修作業中心',
      icon: <ClipboardList size={20} />,
      roles: [UserRole.FACILITY_MANAGER, UserRole.ADMIN]
    },
    {
      path: '/approvals',
      label: '預約審核',
      icon: <FileCheck size={20} />,
      roles: [UserRole.FACILITY_MANAGER, UserRole.ADMIN]
    },
    {
      path: '/rooms',
      label: '會議室設定',
      icon: <DoorOpen size={20} />,
      roles: [UserRole.FACILITY_MANAGER, UserRole.ADMIN]
    },
    {
      path: '/admin',
      label: '系統設定',
      icon: <Settings size={20} />,
      roles: [UserRole.ADMIN, UserRole.FACILITY_MANAGER]
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

  const renderNav = (isCollapsed: boolean = false) => (
    <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
      {/* General Section */}
      <div className="space-y-1">
        {!isCollapsed && (
          <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">一般功能</div>
        )}
        {generalItems.map((item) => {
          // Guest access logic
          if (!currentUser && !['/bookings', '/repairs'].includes(item.path)) return null;
          if (currentUser && !item.roles.includes(currentUser.role)) return null;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={navItemClass(item.path, isCollapsed)}
              onClick={() => setMobileMenuOpen(false)}
              title={isCollapsed ? item.label : undefined}
            >
              {item.icon}
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Management Section - Separated by Divider */}
      {currentUser && hasAnyManagementAccess && (
        <div className="space-y-1">
          <div className="my-4 border-t border-slate-200" />
          {!isCollapsed && (
            <div className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">管理專區</div>
          )}

          {managementItems.map((item) => {
             if (!hasAccess(item.roles)) return null;
             return (
              <Link
                key={item.path}
                to={item.path}
                className={navItemClass(item.path, isCollapsed)}
                onClick={() => setMobileMenuOpen(false)}
                title={isCollapsed ? item.label : undefined}
              >
                {item.icon}
                {!isCollapsed && <span>{item.label}</span>}
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
      case UserRole.FACILITY_MANAGER: return '設施管理員';
      case UserRole.USER: return '一般使用者';
      case UserRole.GUEST: return '訪客';
      default: return role;
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Desktop Sidebar */}
      <aside className={`${collapsed ? 'w-[72px]' : 'w-64'} bg-white border-r border-gray-200 fixed h-full z-20 hidden md:flex flex-col shadow-sm transition-[width] duration-200`}>
        <div className={`border-b border-gray-100 ${collapsed ? 'p-3' : 'p-6'}`}>
          <div className={`flex items-center text-blue-600 font-bold text-xl ${collapsed ? 'justify-center' : 'justify-between gap-2'}`}>
            {!collapsed && (
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="h-8 w-8 flex-shrink-0" />
                <span className="truncate">MeetFix</span>
              </div>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              className="text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg p-1.5 flex-shrink-0 transition-colors"
              title={collapsed ? '展開側邊欄' : '收合側邊欄'}
              aria-label={collapsed ? '展開側邊欄' : '收合側邊欄'}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
          </div>
          {!collapsed && <p className="text-xs text-slate-400 mt-1">會議與報修系統</p>}
        </div>

        {renderNav(collapsed)}

        <div className={`border-t border-gray-100 bg-slate-50/50 ${collapsed ? 'p-2' : 'p-4'}`}>
          {currentUser ? (
            <div className="space-y-3">
              <div
                className={`flex items-center cursor-pointer hover:bg-white rounded-lg transition-colors group relative border border-transparent hover:border-slate-200 hover:shadow-sm ${collapsed ? 'justify-center p-2' : 'gap-3 px-2 p-2'}`}
                onClick={handleOpenProfile}
                title="點擊開啟帳號設定"
              >
                <div className="relative">
                   <Avatar avatarUrl={currentUser.avatarUrl} name={currentUser.name} size={24} className="w-10 h-10 rounded-full bg-slate-200 text-slate-500" />
                   <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                      <Edit2 size={10} className="text-slate-500"/>
                   </div>
                </div>
                {!collapsed && (
                  <div className="overflow-hidden">
                    <p className="text-sm font-medium truncate group-hover:text-blue-600 transition-colors">{currentUser.name}</p>
                    <p className="text-xs text-slate-500 truncate">{getRoleName(currentUser.role)}</p>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                onClick={handleLogout}
                className={`w-full bg-white ${collapsed ? 'justify-center px-0' : 'justify-start text-sm'}`}
                title={collapsed ? '登出' : undefined}
                aria-label="登出"
              >
                <LogOut size={16} />
                {!collapsed && '登出'}
              </Button>
            </div>
          ) : (
            <Button onClick={() => navigate('/')} className="w-full">
              {collapsed ? <UserCircle size={20} /> : '登入'}
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
                <Avatar avatarUrl={currentUser.avatarUrl} name={currentUser.name} size={18} className="w-8 h-8 rounded-full border border-slate-200 bg-slate-100 text-slate-500" />
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
      <main className={`flex-1 ${collapsed ? 'md:ml-[72px]' : 'md:ml-64'} p-4 md:p-8 mt-14 md:mt-0 overflow-x-hidden transition-[margin] duration-200`}>
        {children}
      </main>

      {/* Profile Modal */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden animate-fade-in flex flex-col">
            <div className="px-6 py-4 border-b bg-slate-50 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg text-slate-800">帳號設定</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-slate-600"><X/></button>
            </div>
            <div className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto min-h-0">
                <div className="flex flex-col items-center gap-2 mb-2">
                  <Avatar avatarUrl={currentUser.avatarUrl} name={currentUser.name} size={48} className="w-24 h-24 rounded-full bg-slate-100 ring-4 ring-slate-50 text-slate-400" />
                  <p className="font-semibold text-slate-800">{currentUser.name}</p>
                  <p className="text-xs text-slate-500">{currentUser.email}</p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                  <p className="text-sm font-medium text-slate-700">報修人資料</p>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">班級 / 部門 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={profileClass}
                      onChange={e => setProfileClass(e.target.value)}
                      placeholder="例: 資訊三甲"
                      className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">聯絡電話 <span className="text-red-500">*</span></label>
                    <input
                      type="tel"
                      required
                      value={profilePhone}
                      onChange={e => setProfilePhone(e.target.value)}
                      placeholder="09xx-xxx-xxx"
                      className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-white"
                    disabled={savingProfile || !isReporterInfoComplete(profileClass, profilePhone)}
                    onClick={handleSaveProfile}
                  >
                    {savingProfile ? '儲存中…' : '儲存報修人資料'}
                  </Button>
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

                {currentUser.hasPassword === true && (
                  <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                    <p className="text-sm font-medium text-slate-700">修改密碼</p>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">目前密碼</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">新密碼</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">確認新密碼</label>
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={e => setConfirmNewPassword(e.target.value)}
                        className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full bg-white"
                      disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                      onClick={handleChangePassword}
                    >
                      {changingPassword ? '更新中…' : '更新密碼'}
                    </Button>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 flex justify-end gap-3 border-t shrink-0">
                <Button type="button" variant="ghost" onClick={() => setShowProfileModal(false)}>關閉</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
