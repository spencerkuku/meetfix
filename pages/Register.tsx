import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../App';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { UserPlus } from 'lucide-react';

export const Register: React.FC = () => {
  const { registerWithPassword } = useData();
  const { success, error } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const status = await registerWithPassword(email, name, password);
      if (status === 'ACTIVE') {
        success('註冊成功，請使用帳號密碼登入');
      } else {
        success('註冊成功，帳號待管理員審核通過後即可登入');
      }
      navigate('/');
    } catch (err) {
      error(err instanceof Error ? err.message : '註冊失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-8">
        <div className="text-center">
          <div className="mx-auto bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <UserPlus className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">註冊新帳號</h2>
          <p className="mt-2 text-slate-600">適用於沒有學校 Google 帳號的使用者（例如校外廠商）</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="姓名"
            className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
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
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="密碼（至少 8 碼）"
            className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <Button type="submit" disabled={submitting} isLoading={submitting} className="w-full justify-center">
            註冊
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500">
          已經有帳號了？<Link to="/" className="text-blue-600 hover:underline">返回登入</Link>
        </p>
      </div>
    </div>
  );
};
