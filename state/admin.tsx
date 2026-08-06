import React, { createContext, useContext, useEffect, useState } from 'react';
import { AdminUser, AccountStatus, UserRole, PendingAccount, AutoApprovedDomain, AuditLogEntry } from '../types';
import {
  fetchUsers,
  updateUserRole as updateUserRoleApi,
  updateUserStatus as updateUserStatusApi,
  deleteUser as deleteUserApi,
  fetchPendingAccounts,
  approveAccount as approveAccountApi,
  rejectAccount as rejectAccountApi,
  fetchAutoApprovedDomains,
  addAutoApprovedDomain as addAutoApprovedDomainApi,
  updateAutoApprovedDomain as updateAutoApprovedDomainApi,
  removeAutoApprovedDomain as removeAutoApprovedDomainApi,
} from '../services/admin';
import { fetchAuditLog } from '../services/audit';
import { useAuthData } from './auth';

export interface AdminData {
  users: AdminUser[];
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
  updateUserStatus: (userId: string, status: AccountStatus) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  pendingAccounts: PendingAccount[];
  approveAccount: (accountId: string, role: UserRole) => Promise<void>;
  rejectAccount: (accountId: string, reason?: string) => Promise<void>;
  autoApprovedDomains: AutoApprovedDomain[];
  addAutoApprovedDomain: (domain: string, allowSubdomains?: boolean) => Promise<void>;
  updateAutoApprovedDomain: (id: string, allowSubdomains: boolean) => Promise<void>;
  removeAutoApprovedDomain: (id: string) => Promise<void>;
  auditLog: AuditLogEntry[];
}

const AdminContext = createContext<AdminData | undefined>(undefined);

export const useAdminData = () => {
  const context = useContext(AdminContext);
  if (!context) throw new Error('useAdminData must be used within an AdminProvider');
  return context;
};

// User/Account administration, Account Approval, the Auto-Approved Domain
// list, and the Audit Log — all ADMIN-only, all fetched only when
// currentUser.role === ADMIN. See CONTEXT.md's ADMIN role entry.
export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuthData();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pendingAccounts, setPendingAccounts] = useState<PendingAccount[]>([]);
  const [autoApprovedDomains, setAutoApprovedDomains] = useState<AutoApprovedDomain[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.ADMIN) {
      setUsers([]);
      setPendingAccounts([]);
      setAutoApprovedDomains([]);
      setAuditLog([]);
      return;
    }
    fetchUsers().then(setUsers).catch(() => setUsers([]));
    fetchPendingAccounts().then(setPendingAccounts).catch(() => setPendingAccounts([]));
    fetchAutoApprovedDomains().then(setAutoApprovedDomains).catch(() => setAutoApprovedDomains([]));
    fetchAuditLog().then(setAuditLog).catch(() => setAuditLog([]));
  }, [currentUser]);

  const updateUserRole = async (userId: string, role: UserRole) => {
    const user = await updateUserRoleApi(userId, role);
    setUsers(prev => prev.map(u => u.id === userId ? user : u));
  };

  const updateUserStatus = async (userId: string, status: AccountStatus) => {
    const user = await updateUserStatusApi(userId, status);
    setUsers(prev => prev.map(u => u.id === userId ? user : u));
  };

  const deleteUser = async (userId: string) => {
    await deleteUserApi(userId);
    setUsers(prev => prev.filter(u => u.id !== userId));
  };

  const approveAccount = async (accountId: string, role: UserRole) => {
    await approveAccountApi(accountId, role);
    setPendingAccounts(prev => prev.filter(a => a.id !== accountId));
    setUsers(await fetchUsers());
  };

  const rejectAccount = async (accountId: string, reason?: string) => {
    await rejectAccountApi(accountId, reason);
    setPendingAccounts(prev => prev.filter(a => a.id !== accountId));
  };

  const addAutoApprovedDomain = async (domain: string, allowSubdomains = false) => {
    const created = await addAutoApprovedDomainApi(domain, allowSubdomains);
    setAutoApprovedDomains(prev => [...prev, created]);
  };

  const updateAutoApprovedDomain = async (id: string, allowSubdomains: boolean) => {
    const updated = await updateAutoApprovedDomainApi(id, allowSubdomains);
    setAutoApprovedDomains(prev => prev.map(d => d.id === id ? updated : d));
  };

  const removeAutoApprovedDomain = async (id: string) => {
    await removeAutoApprovedDomainApi(id);
    setAutoApprovedDomains(prev => prev.filter(d => d.id !== id));
  };

  return (
    <AdminContext.Provider value={{
      users, updateUserRole, updateUserStatus, deleteUser,
      pendingAccounts, approveAccount, rejectAccount,
      autoApprovedDomains, addAutoApprovedDomain, updateAutoApprovedDomain, removeAutoApprovedDomain,
      auditLog,
    }}>
      {children}
    </AdminContext.Provider>
  );
};
