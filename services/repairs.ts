import { RepairCategory, RepairTicket } from '../types';
import { API_URL, API_BASE_URL, authHeaders } from './http';

export interface RepairTicketFormInput {
  location: string;
  category: string;
  description: string;
  userClass?: string;
  userPhone?: string;
}

interface ApiRepairTicket extends Omit<RepairTicket, 'imageUrl'> {
  imageUrl: string | null;
}

// The API returns image paths relative to itself (e.g. /uploads/repairs/x.png);
// resolve them against the API origin so the browser can load them directly.
function toRepairTicket(ticket: ApiRepairTicket): RepairTicket {
  return {
    ...ticket,
    imageUrl: ticket.imageUrl
      ? (ticket.imageUrl.startsWith('http')
          ? ticket.imageUrl
          : `${API_URL}${ticket.imageUrl}`)
      : undefined,
  };
}

export interface UpdateRepairTicketInput {
  status?: RepairTicket['status'];
  adminReply?: string;
}

export async function fetchRepairs(): Promise<RepairTicket[]> {
  const res = await fetch(`${API_BASE_URL}/repairs`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch repair tickets');
  const data: ApiRepairTicket[] = await res.json();
  return data.map(toRepairTicket);
}

export async function createRepairTicket(
  input: RepairTicketFormInput,
  photo?: File,
): Promise<RepairTicket> {
  const formData = new FormData();
  formData.append('location', input.location);
  formData.append('category', input.category);
  formData.append('description', input.description);
  if (input.userClass) formData.append('userClass', input.userClass);
  if (input.userPhone) formData.append('userPhone', input.userPhone);
  if (photo) formData.append('photo', photo);

  const res = await fetch(`${API_BASE_URL}/repairs`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to submit repair ticket');
  return toRepairTicket(await res.json());
}

export async function updateRepairTicket(
  id: string,
  updates: UpdateRepairTicketInput,
): Promise<RepairTicket> {
  const res = await fetch(`${API_BASE_URL}/repairs/${id}`, {
    method: 'PATCH',
    headers: authHeaders(true),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update repair ticket');
  return toRepairTicket(await res.json());
}

export interface UpdateRepairContentInput {
  location?: string;
  category?: string;
  description?: string;
  removePhoto?: boolean;
}

// Reporter-side content edit — deliberately a distinct endpoint from
// updateRepairTicket (FACILITY_MANAGER/ADMIN-only status/reply), since the
// permission model and payload shape are both different. Multipart, like
// createRepairTicket, since a new photo may be attached.
export async function updateRepairContent(
  id: string,
  input: UpdateRepairContentInput,
  photo?: File,
): Promise<RepairTicket> {
  const formData = new FormData();
  if (input.location !== undefined) formData.append('location', input.location);
  if (input.category !== undefined) formData.append('category', input.category);
  if (input.description !== undefined) formData.append('description', input.description);
  if (input.removePhoto) formData.append('removePhoto', 'true');
  if (photo) formData.append('photo', photo);

  const res = await fetch(`${API_BASE_URL}/repairs/${id}/content`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: formData,
  });
  if (res.status === 409) {
    throw new Error('This Repair Ticket is no longer PENDING');
  }
  if (!res.ok) throw new Error('Failed to update repair ticket');
  return toRepairTicket(await res.json());
}

export async function deleteRepairTicket(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/repairs/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete repair ticket');
}

// Extracts the filename from a Content-Disposition header, falling back to
// a generic name if the header is missing or unparseable — the caller still
// gets a working download either way.
function filenameFromContentDisposition(header: string | null): string {
  const match = header?.match(/filename\*=UTF-8''([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '報修單.csv';
}

// FACILITY_MANAGER/ADMIN-only bulk export. Uses fetch + blob rather than a
// plain navigation/link, since auth here is a Bearer token (not a cookie)
// and the browser needs the Authorization header attached to the request.
export async function exportRepairsCsv(range?: {
  from: string;
  to: string;
}): Promise<void> {
  const query = range ? `?from=${range.from}&to=${range.to}` : '';
  const res = await fetch(`${API_BASE_URL}/repairs/export${query}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to export repair tickets');

  const blob = await res.blob();
  const filename = filenameFromContentDisposition(
    res.headers.get('Content-Disposition'),
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function fetchRepairCategories(): Promise<RepairCategory[]> {
  const res = await fetch(`${API_BASE_URL}/repair-categories`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch repair categories');
  return res.json();
}

export async function createRepairCategory(
  name: string,
): Promise<RepairCategory> {
  const res = await fetch(`${API_BASE_URL}/repair-categories`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create repair category');
  return res.json();
}

export async function deleteRepairCategory(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/repair-categories/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete repair category');
}
