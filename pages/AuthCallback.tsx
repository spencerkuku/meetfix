import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../App';

export const AuthCallback: React.FC = () => {
  const { completeGoogleLogin } = useData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = searchParams.get('code');
    if (!code) {
      navigate('/', { replace: true });
      return;
    }
    completeGoogleLogin(code).then(() => {
      navigate('/bookings', { replace: true });
    });
  }, [searchParams, completeGoogleLogin, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <p className="text-slate-600">登入中,請稍候…</p>
    </div>
  );
};
