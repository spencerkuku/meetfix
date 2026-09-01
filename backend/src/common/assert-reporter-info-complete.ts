import { BadRequestException } from '@nestjs/common';
import { isReporterInfoComplete } from 'repair-visibility';

// Reporter info (class/phone — see User.userClass/userPhone and
// RepairTicket.userClass/userPhone) is required wherever it's submitted:
// Repair Ticket creation and the User profile update it writes back to.
// What counts as "blank" is shared with the frontend via
// isReporterInfoComplete; only the reaction (throw vs. disable a button)
// differs per side.
export function assertReporterInfoComplete(
  userClass: string | undefined,
  userPhone: string | undefined,
): void {
  if (!isReporterInfoComplete(userClass ?? '', userPhone ?? '')) {
    throw new BadRequestException('userClass and userPhone are required');
  }
}
