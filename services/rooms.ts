import { Room } from '../types';
import { API_URL, API_BASE_URL, authHeaders } from './http';

interface ApiRoom {
  id: string;
  name: string;
  location: string;
  capacity: number | null;
  equipment: string[];
  imageUrl: string | null;
  requiresApproval: boolean;
}

export interface RoomFormInput {
  name: string;
  location: string;
  capacity?: number;
  equipment: string[];
  requiresApproval: boolean;
}

// The API returns image paths relative to itself (e.g. /uploads/rooms/x.png);
// resolve them against the API origin so the browser can load them directly.
function toRoom(room: ApiRoom): Room {
  return {
    ...room,
    imageUrl: room.imageUrl
      ? (room.imageUrl.startsWith('http')
          ? room.imageUrl
          : `${API_URL}${room.imageUrl}`)
      : undefined,
  };
}

function toFormData(input: Partial<RoomFormInput>, photo?: File): FormData {
  const formData = new FormData();
  if (input.name !== undefined) formData.append('name', input.name);
  if (input.location !== undefined) formData.append('location', input.location);
  if (input.capacity !== undefined) {
    formData.append('capacity', String(input.capacity));
  }
  if (input.equipment !== undefined) {
    formData.append('equipment', input.equipment.join(', '));
  }
  if (input.requiresApproval !== undefined) {
    formData.append('requiresApproval', String(input.requiresApproval));
  }
  if (photo) formData.append('photo', photo);
  return formData;
}

export async function fetchRooms(): Promise<Room[]> {
  const res = await fetch(`${API_BASE_URL}/rooms`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch rooms');
  const data: ApiRoom[] = await res.json();
  return data.map(toRoom);
}

export async function createRoom(
  input: RoomFormInput,
  photo?: File,
): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/rooms`, {
    method: 'POST',
    headers: authHeaders(),
    body: toFormData(input, photo),
  });
  if (!res.ok) throw new Error('Failed to create room');
  return toRoom(await res.json());
}

export async function updateRoomApi(
  id: string,
  input: Partial<RoomFormInput>,
  photo?: File,
): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/rooms/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: toFormData(input, photo),
  });
  if (!res.ok) throw new Error('Failed to update room');
  return toRoom(await res.json());
}

export async function deleteRoomApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/rooms/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete room');
}
