import { RepairCategory, RepairTicket } from '../types';
import { API_URL, API_BASE_URL, authHeaders, apiFetch, ApiError } from './http';

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
  const data = await apiFetch<ApiRepairTicket[]>('/repairs', { fallbackMessage: 'Failed to fetch repair tickets' });
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

  const data = await apiFetch<ApiRepairTicket>('/repairs', {
    method: 'POST',
    body: formData,
    fallbackMessage: 'Failed to submit repair ticket',
  });
  return toRepairTicket(data);
}

export async function updateRepairTicket(
  id: string,
  updates: UpdateRepairTicketInput,
): Promise<RepairTicket> {
  const data = await apiFetch<ApiRepairTicket>(`/repairs/${id}`, {
    method: 'PATCH',
    json: true,
    body: JSON.stringify(updates),
    fallbackMessage: 'Failed to update repair ticket',
  });
  return toRepairTicket(data);
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

  try {
    const data = await apiFetch<ApiRepairTicket>(`/repairs/${id}/content`, {
      method: 'PATCH',
      body: formData,
      fallbackMessage: 'Failed to update repair ticket',
    });
    return toRepairTicket(data);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      throw new Error('This Repair Ticket is no longer PENDING');
    }
    throw err;
  }
}

export async function deleteRepairTicket(id: string): Promise<void> {
  return apiFetch<void>(`/repairs/${id}`, {
    method: 'DELETE',
    parseJson: false,
    fallbackMessage: 'Failed to delete repair ticket',
  });
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
// Not migrated to apiFetch: the response is a Blob, not JSON.
// Converts a browser-local YYYY-MM-DD calendar date (as produced by a
// native <input type="date">) into the UTC instant marking its start or
// end IN THE USER'S OWN LOCAL TIMEZONE — the browser already knows this
// timezone, so computing the boundary here (rather than assuming UTC on
// the server) is what makes the exported range match the calendar day the
// user actually selected. `T00:00:00.000`/`T23:59:59.999` with no explicit
// offset is parsed by the JS Date constructor as local time, unlike a
// bare date-only string (which the spec mandates UTC) — that distinction
// is exactly what this function relies on. See the security audit finding
// this closes.
export function localDateToUtcInstant(date: string, endOfDay: boolean): string {
  const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
  return new Date(`${date}T${time}`).toISOString();
}

export async function exportRepairsCsv(range?: {
  from: string;
  to: string;
}): Promise<void> {
  const query = range
    ? `?from=${encodeURIComponent(localDateToUtcInstant(range.from, false))}&to=${encodeURIComponent(localDateToUtcInstant(range.to, true))}`
    : '';
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
  return apiFetch<RepairCategory[]>('/repair-categories', {
    fallbackMessage: 'Failed to fetch repair categories',
  });
}

export async function createRepairCategory(
  name: string,
): Promise<RepairCategory> {
  return apiFetch<RepairCategory>('/repair-categories', {
    method: 'POST',
    json: true,
    body: JSON.stringify({ name }),
    fallbackMessage: 'Failed to create repair category',
  });
}

export async function deleteRepairCategory(id: string): Promise<void> {
  return apiFetch<void>(`/repair-categories/${id}`, {
    method: 'DELETE',
    parseJson: false,
    fallbackMessage: 'Failed to delete repair category',
  });
}
