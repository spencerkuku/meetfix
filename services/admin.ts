import { AccountStatus, AdminUser, AutoApprovedDomain, PendingAccount, User, UserRole } from '../types';
import { API_BASE_URL, authHeaders } from './http';

interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl: string | null;
}

interface ApiAdminUser extends ApiUser {
  accountStatus: AccountStatus;
  googleLinked: boolean;
  hasPassword: boolean;
  bookingCount: number;
  repairTicketCount: number;
}

function toUser(u: ApiUser): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    avatarUrl: u.avatarUrl,
  };
}

function toAdminUser(u: ApiAdminUser): AdminUser {
  return {
    ...toUser(u),
    accountStatus: u.accountStatus,
    googleLinked: u.googleLinked,
    hasPassword: u.hasPassword,
    bookingCount: u.bookingCount,
    repairTicketCount: u.repairTicketCount,
  };
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE_URL}/admin/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch users');
  const data: ApiAdminUser[] = await res.json();
  return data.map(toAdminUser);
}

export async function updateUserRole(id: string, role: UserRole): Promise<AdminUser> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('Failed to update role');
  return toAdminUser(await res.json());
}

export async function updateUserStatus(id: string, status: AccountStatus): Promise<AdminUser> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update account status');
  return toAdminUser(await res.json());
}

export async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete user');
}

export async function fetchPendingAccounts(): Promise<PendingAccount[]> {
  const res = await fetch(`${API_BASE_URL}/admin/pending-accounts`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch pending accounts');
  return res.json();
}

export async function approveAccount(accountId: string, role: UserRole): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/approve`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('Failed to approve account');
}

export async function rejectAccount(accountId: string, reason?: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}/reject`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Failed to reject account');
}

export async function fetchAutoApprovedDomains(): Promise<AutoApprovedDomain[]> {
  const res = await fetch(`${API_BASE_URL}/admin/auto-approved-domains`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch auto-approved domains');
  return res.json();
}

export async function addAutoApprovedDomain(domain: string, allowSubdomains = false): Promise<AutoApprovedDomain> {
  const res = await fetch(`${API_BASE_URL}/admin/auto-approved-domains`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ domain, allowSubdomains }),
  });
  if (!res.ok) throw new Error('Failed to add domain');
  return res.json();
}

export async function updateAutoApprovedDomain(id: string, allowSubdomains: boolean): Promise<AutoApprovedDomain> {
  const res = await fetch(`${API_BASE_URL}/admin/auto-approved-domains/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify({ allowSubdomains }),
  });
  if (!res.ok) throw new Error('Failed to update domain');
  return res.json();
}

export async function removeAutoApprovedDomain(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/auto-approved-domains/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove domain');
}
