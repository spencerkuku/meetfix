import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../App';
import { UserRole } from '../types';
import { Button } from '../components/Button';
import { Calendar } from 'lucide-react';

export const Login: React.FC = () => {
  const { loginWithGoogle, currentUser, authLoading } = useData();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (currentUser) {
      navigate(currentUser.role === UserRole.MAINTENANCE ? '/repairs' : '/bookings');
    }
  }, [currentUser, navigate]);

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

        <Button
          variant="outline"
          onClick={loginWithGoogle}
          disabled={authLoading}
          className="justify-center h-12 text-lg w-full"
        >
          使用學校 Google 帳號登入
        </Button>
        <p className="text-center text-sm text-slate-400">僅限學校 Google Workspace 帳號可登入</p>
      </div>
    </div>
  );
};
