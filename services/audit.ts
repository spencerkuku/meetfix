import { AuditLogEntry } from '../types';
import { apiFetch } from './http';

export async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  return apiFetch<AuditLogEntry[]>('/audit-log', { fallbackMessage: 'Failed to fetch audit log' });
}
