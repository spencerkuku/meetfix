import { Room } from '../types';
import { API_URL, apiFetch } from './http';

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
  const data = await apiFetch<ApiRoom[]>('/rooms', { fallbackMessage: 'Failed to fetch rooms' });
  return data.map(toRoom);
}

export async function createRoom(
  input: RoomFormInput,
  photo?: File,
): Promise<Room> {
  const data = await apiFetch<ApiRoom>('/rooms', {
    method: 'POST',
    body: toFormData(input, photo),
    fallbackMessage: 'Failed to create room',
  });
  return toRoom(data);
}

export async function updateRoomApi(
  id: string,
  input: Partial<RoomFormInput>,
  photo?: File,
): Promise<Room> {
  const data = await apiFetch<ApiRoom>(`/rooms/${id}`, {
    method: 'PATCH',
    body: toFormData(input, photo),
    fallbackMessage: 'Failed to update room',
  });
  return toRoom(data);
}

export async function deleteRoomApi(id: string): Promise<void> {
  return apiFetch<void>(`/rooms/${id}`, {
    method: 'DELETE',
    parseJson: false,
    fallbackMessage: 'Failed to delete room',
  });
}
