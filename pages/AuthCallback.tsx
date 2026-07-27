import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../App';
import { useToast } from '../components/Toast';

export const AuthCallback: React.FC = () => {
  const { completeGoogleLogin, refreshCurrentUser } = useData();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { success, error } = useToast();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // GET /auth/google/callback redirects here in two distinct modes: a
    // login-code exchange (`code`), or the result of an already-logged-in
    // User linking Google from their profile (`linked`) — the session itself
    // is unchanged in the latter case, so it only needs a refetch of /auth/me.
    const linked = searchParams.get('linked');
    if (linked !== null) {
      if (linked === '1') {
        refreshCurrentUser().then(() => {
          success('已成功連結 Google 帳號');
          navigate('/bookings', { replace: true });
        });
      } else {
        error(searchParams.get('reason') || '連結 Google 帳號失敗');
        navigate('/bookings', { replace: true });
      }
      return;
    }

    const code = searchParams.get('code');
    if (!code) {
      navigate('/', { replace: true });
      return;
    }
    completeGoogleLogin(code).then(() => {
      navigate('/bookings', { replace: true });
    });
  }, [searchParams, completeGoogleLogin, refreshCurrentUser, success, error, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <p className="text-slate-600">登入中,請稍候…</p>
    </div>
  );
};
