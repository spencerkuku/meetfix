
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  FACILITY_MANAGER = 'FACILITY_MANAGER',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl: string | null;
  class?: string;
  phone?: string;
  googleLinked?: boolean;
  hasPassword?: boolean;
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

// A User as shown in 人員權限管理 (Admin.tsx) — includes fields only an
// ADMIN needs: currently-linked login methods, Account Status, and enough
// of a footprint to warn before a destructive User Deletion.
export interface AdminUser extends User {
  accountStatus: AccountStatus;
  googleLinked: boolean;
  hasPassword: boolean;
  bookingCount: number;
  repairTicketCount: number;
}

export interface Room {
  id: string;
  name: string;
  location: string;
  capacity: number | null;
  equipment: string[];
  imageUrl?: string;
  requiresApproval: boolean;
}

export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  userName: string;
  title: string;
  description?: string; // New field for meeting content
  startTime: string; // ISO string
  endTime: string;   // ISO string
  status: 'CONFIRMED' | 'CANCELLED' | 'PENDING_APPROVAL' | 'REJECTED';
}

export enum RepairStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED'
}

export interface RepairCategory {
  id: string;
  name: string;
}

export interface RepairTicket {
  id: string;
  location: string; // free-text location, entered by the reporter.
  userId: string;
  userName: string;
  userClass?: string;
  userPhone?: string;
  description: string;
  category: string;
  imageUrl?: string;
  status: RepairStatus;
  createdAt: string;
  adminReply?: string;
}

export interface PendingAccount {
  id: string; // Account id, used to approve
  userId: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AutoApprovedDomain {
  id: string;
  domain: string;
  allowSubdomains: boolean;
  createdAt: string;
}

export type AuditAction = 'ROLE_CHANGE' | 'BOOKING_APPROVAL' | 'ACCOUNT_APPROVAL' | 'REPAIR_STATUS_CHANGE' | 'AUTO_APPROVED_DOMAIN_CHANGE' | 'ACCOUNT_SUSPENSION' | 'ACCOUNT_REACTIVATION' | 'USER_DELETION';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  detail?: string;
  createdAt: string;
}

export type CalendarViewType = 'MONTH' | 'WEEK' | 'DAY';
