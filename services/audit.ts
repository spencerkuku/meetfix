import { AuditLogEntry } from '../types';
import { API_URL, authHeaders } from './http';

export async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  const res = await fetch(`${API_URL}/audit-log`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch audit log');
  return res.json();
}
