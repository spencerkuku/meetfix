import { Role } from '@prisma/client';
import { canSeeReporterDetails } from './repair-visibility';

describe('canSeeReporterDetails', () => {
  it('hides details from a USER who is not the reporter', () => {
    expect(canSeeReporterDetails(Role.USER, 'caller-1', 'reporter-1')).toBe(
      false,
    );
  });

  it('shows details to the reporter themselves', () => {
    expect(canSeeReporterDetails(Role.USER, 'reporter-1', 'reporter-1')).toBe(
      true,
    );
  });

  it('shows details to ADMIN regardless of ownership', () => {
    expect(canSeeReporterDetails(Role.ADMIN, 'caller-1', 'reporter-1')).toBe(
      true,
    );
  });

  it('shows details to MAINTENANCE regardless of ownership', () => {
    expect(
      canSeeReporterDetails(Role.MAINTENANCE, 'caller-1', 'reporter-1'),
    ).toBe(true);
  });

  it('shows details to ROOM_MANAGER only when they are the reporter', () => {
    expect(
      canSeeReporterDetails(Role.ROOM_MANAGER, 'caller-1', 'reporter-1'),
    ).toBe(false);
    expect(
      canSeeReporterDetails(Role.ROOM_MANAGER, 'reporter-1', 'reporter-1'),
    ).toBe(true);
  });
});
