import { RepairCategory, RepairTicket } from '../types';
import { API_URL, authHeaders } from './http';

export interface RepairTicketFormInput {
  roomId?: string;
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

export async function fetchRepairs(): Promise<RepairTicket[]> {
  const res = await fetch(`${API_URL}/repairs`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch repair tickets');
  const data: ApiRepairTicket[] = await res.json();
  return data.map(toRepairTicket);
}

export async function createRepairTicket(
  input: RepairTicketFormInput,
  photo?: File,
): Promise<RepairTicket> {
  const formData = new FormData();
  if (input.roomId) formData.append('roomId', input.roomId);
  formData.append('location', input.location);
  formData.append('category', input.category);
  formData.append('description', input.description);
  if (input.userClass) formData.append('userClass', input.userClass);
  if (input.userPhone) formData.append('userPhone', input.userPhone);
  if (photo) formData.append('photo', photo);

  const res = await fetch(`${API_URL}/repairs`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to submit repair ticket');
  return toRepairTicket(await res.json());
}

export async function fetchRepairCategories(): Promise<RepairCategory[]> {
  const res = await fetch(`${API_URL}/repair-categories`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch repair categories');
  return res.json();
}

export async function createRepairCategory(
  name: string,
): Promise<RepairCategory> {
  const res = await fetch(`${API_URL}/repair-categories`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create repair category');
  return res.json();
}

export async function deleteRepairCategory(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/repair-categories/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete repair category');
}
