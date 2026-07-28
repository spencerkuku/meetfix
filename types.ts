
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  MAINTENANCE = 'MAINTENANCE',
  ROOM_MANAGER = 'ROOM_MANAGER',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  class?: string;
  phone?: string;
  googleLinked?: boolean;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  equipment: string[];
  imageUrl: string;
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
  roomId?: string; // set when tied to a real Room; absent for a free-text location. See CONTEXT.md.
  location: string; // human-readable location — the Room's name, or free text.
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

export type AuditAction = 'ROLE_CHANGE' | 'BOOKING_APPROVAL' | 'ACCOUNT_APPROVAL' | 'REPAIR_STATUS_CHANGE' | 'AUTO_APPROVED_DOMAIN_CHANGE';

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
