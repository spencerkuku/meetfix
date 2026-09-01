import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthData } from '../state/auth';
import { Footer } from '../components/Footer';
import { useToast } from '../components/Toast';

export const AuthCallback: React.FC = () => {
  const { completeGoogleLogin, refreshCurrentUser } = useAuthData();
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

    // A login failure (e.g. a suspended Account, or a Google account
    // outside the school domain) redirects here with `error` instead of
    // `code` — see AuthController.googleCallback.
    const loginError = searchParams.get('error');
    if (loginError !== null) {
      error(loginError);
      navigate('/', { replace: true });
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100">
      <p className="text-slate-600 flex-1 flex items-center">登入中,請稍候…</p>
      <Footer />
    </div>
  );
};
