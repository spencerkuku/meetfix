import { AccountStatus } from '@prisma/client';

export interface UpdateStatusDto {
  status: AccountStatus;
}
