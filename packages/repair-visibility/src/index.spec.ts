import { canSeeReporterDetails, maskName } from './index';

describe('canSeeReporterDetails', () => {
  it('hides details from a USER who is not the reporter', () => {
    expect(canSeeReporterDetails('USER', 'caller-1', 'reporter-1')).toBe(
      false,
    );
  });

  it('shows details to the reporter themselves', () => {
    expect(canSeeReporterDetails('USER', 'reporter-1', 'reporter-1')).toBe(
      true,
    );
  });

  it('shows details to ADMIN regardless of ownership', () => {
    expect(canSeeReporterDetails('ADMIN', 'caller-1', 'reporter-1')).toBe(
      true,
    );
  });

  it('shows details to MAINTENANCE regardless of ownership', () => {
    expect(
      canSeeReporterDetails('MAINTENANCE', 'caller-1', 'reporter-1'),
    ).toBe(true);
  });

  it('shows details to ROOM_MANAGER only when they are the reporter', () => {
    expect(
      canSeeReporterDetails('ROOM_MANAGER', 'caller-1', 'reporter-1'),
    ).toBe(false);
    expect(
      canSeeReporterDetails('ROOM_MANAGER', 'reporter-1', 'reporter-1'),
    ).toBe(true);
  });

  it('hides details from a GUEST who is not the reporter', () => {
    expect(canSeeReporterDetails('GUEST', 'caller-1', 'reporter-1')).toBe(
      false,
    );
  });
});

describe('maskName', () => {
  it('masks a 3-character name, keeping first and last', () => {
    expect(maskName('陳小美')).toBe('陳O美');
    expect(maskName('王大明')).toBe('王O明');
  });

  it('masks a 2-character name to first char + O', () => {
    expect(maskName('王明')).toBe('王O');
  });

  it('leaves a name shorter than 2 characters unchanged', () => {
    expect(maskName('王')).toBe('王');
    expect(maskName('')).toBe('');
  });

  it('masks the middle of longer names, keeping first and last', () => {
    expect(maskName('Jonathan')).toBe('JOnathan');
  });
});
