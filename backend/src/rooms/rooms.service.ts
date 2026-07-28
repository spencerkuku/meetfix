import { Injectable, NotFoundException } from '@nestjs/common';
import { Room } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoomInput } from './room-form.dto';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Room[]> {
    return this.prisma.room.findMany({ orderBy: { createdAt: 'asc' } });
  }

  create(input: RoomInput, imageUrl: string | undefined): Promise<Room> {
    return this.prisma.room.create({ data: { ...input, imageUrl } });
  }

  async update(
    id: string,
    input: Partial<RoomInput>,
    imageUrl: string | undefined,
  ): Promise<Room> {
    await this.assertExists(id);
    return this.prisma.room.update({
      where: { id },
      data: { ...input, ...(imageUrl ? { imageUrl } : {}) },
    });
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.room.delete({ where: { id } });
  }

  private async assertExists(id: string): Promise<void> {
    const room = await this.prisma.room.findUnique({ where: { id } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
  }
}
