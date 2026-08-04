import { BadRequestException } from '@nestjs/common';

// Reporter info (class/phone — see User.userClass/userPhone and
// RepairTicket.userClass/userPhone) is required wherever it's submitted:
// Repair Ticket creation and the User profile update it writes back to.
// Shared so the two never drift on what counts as "blank".
export function assertReporterInfoComplete(
  userClass: string | undefined,
  userPhone: string | undefined,
): void {
  if (!userClass?.trim() || !userPhone?.trim()) {
    throw new BadRequestException('userClass and userPhone are required');
  }
}
