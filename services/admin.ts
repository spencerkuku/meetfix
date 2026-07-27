import { AutoApprovedDomain, PendingAccount, User, UserRole } from '../types';
import { API_URL, authHeaders } from './http';

interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

function toUser(u: ApiUser): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatar: `https://i.pravatar.cc/150?u=${u.id}`,
  };
}

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${API_URL}/admin/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch users');
  const data: ApiUser[] = await res.json();
  return data.map(toUser);
}

export async function updateUserRole(id: string, role: UserRole): Promise<User> {
  const res = await fetch(`${API_URL}/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('Failed to update role');
  return toUser(await res.json());
}

export async function fetchPendingAccounts(): Promise<PendingAccount[]> {
  const res = await fetch(`${API_URL}/admin/pending-accounts`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch pending accounts');
  return res.json();
}

export async function approveAccount(accountId: string, role: UserRole): Promise<void> {
  const res = await fetch(`${API_URL}/admin/accounts/${accountId}/approve`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('Failed to approve account');
}

export async function fetchAutoApprovedDomains(): Promise<AutoApprovedDomain[]> {
  const res = await fetch(`${API_URL}/admin/auto-approved-domains`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch auto-approved domains');
  return res.json();
}

export async function addAutoApprovedDomain(domain: string): Promise<AutoApprovedDomain> {
  const res = await fetch(`${API_URL}/admin/auto-approved-domains`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ domain }),
  });
  if (!res.ok) throw new Error('Failed to add domain');
  return res.json();
}

export async function removeAutoApprovedDomain(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/admin/auto-approved-domains/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove domain');
}
