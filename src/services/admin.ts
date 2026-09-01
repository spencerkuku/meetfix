import { AccountStatus, AdminUser, AutoApprovedDomain, PendingAccount, User, UserRole } from '../types';
import { apiFetch } from './http';

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
  const data = await apiFetch<ApiAdminUser[]>('/admin/users', { fallbackMessage: 'Failed to fetch users' });
  return data.map(toAdminUser);
}

export async function updateUserRole(id: string, role: UserRole): Promise<AdminUser> {
  const data = await apiFetch<ApiAdminUser>(`/admin/users/${id}/role`, {
    method: 'PATCH',
    json: true,
    body: JSON.stringify({ role }),
    fallbackMessage: 'Failed to update role',
  });
  return toAdminUser(data);
}

export async function updateUserStatus(id: string, status: AccountStatus): Promise<AdminUser> {
  const data = await apiFetch<ApiAdminUser>(`/admin/users/${id}/status`, {
    method: 'PATCH',
    json: true,
    body: JSON.stringify({ status }),
    fallbackMessage: 'Failed to update account status',
  });
  return toAdminUser(data);
}

export async function deleteUser(id: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${id}`, {
    method: 'DELETE',
    parseJson: false,
    fallbackMessage: 'Failed to delete user',
  });
}

export async function fetchPendingAccounts(): Promise<PendingAccount[]> {
  return apiFetch<PendingAccount[]>('/admin/pending-accounts', {
    fallbackMessage: 'Failed to fetch pending accounts',
  });
}

export async function approveAccount(accountId: string, role: UserRole): Promise<void> {
  return apiFetch<void>(`/admin/accounts/${accountId}/approve`, {
    method: 'PATCH',
    json: true,
    body: JSON.stringify({ role }),
    parseJson: false,
    fallbackMessage: 'Failed to approve account',
  });
}

export async function rejectAccount(accountId: string, reason?: string): Promise<void> {
  return apiFetch<void>(`/admin/accounts/${accountId}/reject`, {
    method: 'PATCH',
    json: true,
    body: JSON.stringify({ reason }),
    parseJson: false,
    fallbackMessage: 'Failed to reject account',
  });
}

export async function fetchAutoApprovedDomains(): Promise<AutoApprovedDomain[]> {
  return apiFetch<AutoApprovedDomain[]>('/admin/auto-approved-domains', {
    fallbackMessage: 'Failed to fetch auto-approved domains',
  });
}

export async function addAutoApprovedDomain(domain: string, allowSubdomains = false): Promise<AutoApprovedDomain> {
  return apiFetch<AutoApprovedDomain>('/admin/auto-approved-domains', {
    method: 'POST',
    json: true,
    body: JSON.stringify({ domain, allowSubdomains }),
    fallbackMessage: 'Failed to add domain',
  });
}

export async function updateAutoApprovedDomain(id: string, allowSubdomains: boolean): Promise<AutoApprovedDomain> {
  return apiFetch<AutoApprovedDomain>(`/admin/auto-approved-domains/${id}`, {
    method: 'PATCH',
    json: true,
    body: JSON.stringify({ allowSubdomains }),
    fallbackMessage: 'Failed to update domain',
  });
}

export async function removeAutoApprovedDomain(id: string): Promise<void> {
  return apiFetch<void>(`/admin/auto-approved-domains/${id}`, {
    method: 'DELETE',
    parseJson: false,
    fallbackMessage: 'Failed to remove domain',
  });
}
