import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RepairTicket } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RepairTicketInput } from './repair-ticket-form.dto';

export type RepairTicketWithUserName = RepairTicket & { userName: string };

function withUserName(
  ticket: RepairTicket & { user: { name: string } },
): RepairTicketWithUserName {
  const { user, ...rest } = ticket;
  return { ...rest, userName: user.name };
}

@Injectable()
export class RepairsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<RepairTicketWithUserName[]> {
    const tickets = await this.prisma.repairTicket.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
    return tickets.map(withUserName);
  }

  async create(
    userId: string,
    dto: RepairTicketInput,
    imageUrl?: string,
  ): Promise<RepairTicketWithUserName> {
    if ((!dto.location && !dto.roomId) || !dto.category || !dto.description) {
      throw new BadRequestException(
        'location (or roomId), category and description are required',
      );
    }

    const category = await this.prisma.repairCategory.findUnique({
      where: { name: dto.category },
    });
    if (!category) {
      throw new BadRequestException('Unknown Repair Category');
    }

    let location = dto.location;
    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: dto.roomId },
      });
      if (!room) {
        throw new NotFoundException('Room not found');
      }
      // A Room's name at submission time — the ticket stays readable even
      // if the Room is later renamed or removed. See CONTEXT.md.
      location = dto.location?.trim() || room.name;
    }

    const created = await this.prisma.repairTicket.create({
      data: { ...dto, location, userId, imageUrl },
      include: { user: { select: { name: true } } },
    });
    return withUserName(created);
  }

  findAllCategories() {
    return this.prisma.repairCategory.findMany({ orderBy: { name: 'asc' } });
  }

  async createCategory(name: string) {
    if (!name?.trim()) {
      throw new BadRequestException('name is required');
    }
    try {
      return await this.prisma.repairCategory.create({
        data: { name: name.trim() },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('This category already exists');
      }
      throw err;
    }
  }

  async removeCategory(id: string): Promise<void> {
    const category = await this.prisma.repairCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Repair Category not found');
    }
    await this.prisma.repairCategory.delete({ where: { id } });
  }
}
