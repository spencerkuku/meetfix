import { RepairStatus } from '@prisma/client';

export interface UpdateRepairTicketDto {
  status?: RepairStatus;
  adminReply?: string;
}
