import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../App';
import { UserRole } from '../types';
import { Button } from '../components/Button';
import { User, Settings, Wrench, Shield, Calendar } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, currentUser } = useData();
  const navigate = useNavigate();

  // If already logged in, redirect to appropriate home
  React.useEffect(() => {
    if (currentUser) {
      if (currentUser.role === UserRole.MAINTENANCE) {
        navigate('/repairs');
      } else {
        navigate('/bookings');
      }
    }
  }, [currentUser, navigate]);

  const handleRoleLogin = (role: UserRole) => {
    login(role);
    navigate(role === UserRole.ADMIN || role === UserRole.ROOM_MANAGER || role === UserRole.MAINTENANCE ? '/dashboard' : '/bookings');
  };

  const handleGuest = () => {
    navigate('/bookings');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-8">
        <div className="text-center">
          <div className="mx-auto bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <Calendar className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">歡迎使用 MeetFix</h2>
          <p className="mt-2 text-slate-600">智慧會議預約與報修管理系統</p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">模擬 OAuth 登入身分</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Button variant="outline" onClick={() => handleRoleLogin(UserRole.USER)} className="justify-start h-12 text-lg">
              <User className="mr-2 text-blue-500" /> 一般使用者 (User)
            </Button>
            <Button variant="outline" onClick={() => handleRoleLogin(UserRole.MAINTENANCE)} className="justify-start h-12 text-lg">
              <Wrench className="mr-2 text-orange-500" /> 報修管理員 (Repair Manager)
            </Button>
            <Button variant="outline" onClick={() => handleRoleLogin(UserRole.ROOM_MANAGER)} className="justify-start h-12 text-lg">
              <Settings className="mr-2 text-purple-500" /> 會議室管理員 (Manager)
            </Button>
            <Button variant="outline" onClick={() => handleRoleLogin(UserRole.ADMIN)} className="justify-start h-12 text-lg">
              <Shield className="mr-2 text-red-500" /> 系統管理員 (Admin)
            </Button>
          </div>

          <div className="relative mt-6">
             <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
             <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">或繼續使用</span>
            </div>
          </div>
          
          <Button variant="ghost" onClick={handleGuest} className="w-full">
            以訪客身分繼續 (僅供瀏覽)
          </Button>
        </div>
      </div>
    </div>
  );
};
