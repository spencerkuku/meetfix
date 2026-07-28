import { BadRequestException } from '@nestjs/common';

// multipart/form-data always arrives as strings; this is the raw shape
// before parsing into RoomsService's typed input.
export interface RoomFormBody {
  name?: string;
  location?: string;
  capacity?: string;
  equipment?: string;
  requiresApproval?: string;
}

export interface RoomInput {
  name: string;
  location: string;
  capacity?: number;
  equipment: string[];
  requiresApproval: boolean;
}

export function parseRoomForm(body: RoomFormBody): Partial<RoomInput> {
  const input: Partial<RoomInput> = {};
  if (body.name !== undefined) input.name = body.name;
  if (body.location !== undefined) input.location = body.location;
  if (body.capacity !== undefined && body.capacity !== '') {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new BadRequestException('capacity must be a positive integer');
    }
    input.capacity = capacity;
  }
  if (body.equipment !== undefined) {
    input.equipment = body.equipment
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (body.requiresApproval !== undefined) {
    input.requiresApproval = body.requiresApproval === 'true';
  }
  return input;
}
