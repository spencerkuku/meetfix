import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useData } from '../App';
import { UserRole } from '../types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { Calendar } from 'lucide-react';

export const Login: React.FC = () => {
  const { loginWithGoogle, loginWithPassword, currentUser, authLoading } = useData();
  const { error } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (currentUser) {
      navigate(currentUser.role === UserRole.FACILITY_MANAGER ? '/repairs' : '/bookings');
    }
  }, [currentUser, navigate]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await loginWithPassword(email, password);
    } catch (err) {
      error(err instanceof Error ? err.message : '登入失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
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

        <Button
          variant="outline"
          onClick={loginWithGoogle}
          disabled={authLoading}
          className="justify-center h-12 text-lg w-full"
        >
          使用學校 Google 帳號登入
        </Button>
        <p className="text-center text-sm text-slate-400">僅限學校 Google Workspace 帳號可登入</p>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-slate-400">或</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <form onSubmit={handlePasswordLogin} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="密碼"
            className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <Button type="submit" disabled={submitting} isLoading={submitting} className="w-full justify-center">
            使用帳號密碼登入
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500">
          沒有帳號嗎？<Link to="/register" className="text-blue-600 hover:underline">註冊新帳號</Link>
        </p>
      </div>
    </div>
  );
};
