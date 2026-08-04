import {
  canSeeReporterDetails,
  maskName,
  nextRepairStatus,
  revertRepairStatus,
} from './index';

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

  it('shows details to FACILITY_MANAGER regardless of ownership', () => {
    expect(
      canSeeReporterDetails('FACILITY_MANAGER', 'caller-1', 'reporter-1'),
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

describe('nextRepairStatus', () => {
  it('advances PENDING to IN_PROGRESS (接手處理)', () => {
    expect(nextRepairStatus('PENDING')).toBe('IN_PROGRESS');
  });

  it('advances IN_PROGRESS to COMPLETED (標記完成)', () => {
    expect(nextRepairStatus('IN_PROGRESS')).toBe('COMPLETED');
  });

  it('has no forward step from COMPLETED', () => {
    expect(nextRepairStatus('COMPLETED')).toBeNull();
  });
});

describe('revertRepairStatus', () => {
  it('has no revert target from PENDING', () => {
    expect(revertRepairStatus('PENDING')).toBeNull();
  });

  it('reverts IN_PROGRESS to PENDING (退回待處理)', () => {
    expect(revertRepairStatus('IN_PROGRESS')).toBe('PENDING');
  });

  it('reverts COMPLETED to IN_PROGRESS (重新開啟)', () => {
    expect(revertRepairStatus('COMPLETED')).toBe('IN_PROGRESS');
  });

  it('is the inverse of nextRepairStatus for every non-terminal status', () => {
    (['PENDING', 'IN_PROGRESS'] as const).forEach((status) => {
      const advanced = nextRepairStatus(status);
      expect(advanced).not.toBeNull();
      expect(revertRepairStatus(advanced as any)).toBe(status);
    });
  });
});
