import { User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TOKEN_KEY = 'meetfix_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function googleLoginUrl(): string {
  return `${API_URL}/auth/google`;
}

// Exchanges the one-time code from the /auth/google/callback redirect for a
// real session token — the JWT itself never appears in a URL this way.
export async function exchangeLoginCode(code: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return null;
    const data: { accessToken: string } = await res.json();
    return data.accessToken;
  } catch {
    return null;
  }
}

// Password accounts (ADR-0003): a second Account path alongside Google
// OAuth, gated by the Admin-maintained Auto-Approved Domain list.
export async function registerWithPassword(
  email: string,
  name: string,
  password: string,
): Promise<'ACTIVE' | 'PENDING'> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || 'Failed to register');
  }
  const data: { status: 'ACTIVE' | 'PENDING' } = await res.json();
  return data.status;
}

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || 'Failed to log in');
  }
  const data: { accessToken: string } = await res.json();
  return data.accessToken;
}

interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: User['role'];
}

export async function fetchCurrentUser(token: string): Promise<User | null> {
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data: MeResponse = await res.json();
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      avatar: `https://i.pravatar.cc/150?u=${data.id}`,
    };
  } catch {
    return null;
  }
}
